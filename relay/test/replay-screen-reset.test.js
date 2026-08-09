const { test } = require('node:test');
const assert = require('node:assert/strict');
const PtyManager = require('../src/pty-manager');
const ptyRegistry = require('../src/pty-registry');
const WebSocketHandler = require('../src/websocket-handler');

// The replay buffer holds a RAW, cursor-addressed TUI stream, not an append-only
// log: a live buffer measured here carried 15,668 ESC[nA (cursor-up) sequences
// in 1MB. Those are only meaningful against the screen state that existed when
// they were emitted, and two things destroy that on replay:
//
//   1. appendToBuffer trims by shifting whole chunks off the FRONT, so the blob
//      routinely starts mid-repaint. The live buffer's opening bytes were
//      literally ESC[?25l ESC[2D ESC[3B CR ESC[10A - it begins by moving up ten
//      rows that were trimmed away.
//   2. the client's terminal.clear() does not reset cursor state. xterm keeps
//      the cursor's line as row 0, never resets the column, and no-ops entirely
//      at ybase === 0 && y === 0 - the same fact the 'replay' handler already
//      documents.
//
// A repaint whose cursor-up cannot travel above row 0 lands BELOW the block it
// meant to overwrite, so both copies stay on screen. That is the duplicated
// paragraph seen on the dev build. Neither cause is fixable inside the buffer,
// so the replay blob has to arrive with the screen put into a known state.

function drivablePty() {
  const proc = {
    pid: 1,
    kill() {}, write() {}, resize() {}, onExit() {},
    onData(cb) { proc._emit = cb; },
  };
  return proc;
}

async function runningManager(id) {
  const pm = new PtyManager(id, 'claude');
  pm._runSelfUpdate = () => Promise.resolve();
  const proc = drivablePty();
  pm._spawnPty = () => proc;
  pm.scheduleSave = () => {};
  await pm.start('/tmp', 80, 24);
  return { pm, emit: (data) => proc._emit(data) };
}

function recordingWs() {
  const sent = [];
  return { OPEN: 1, readyState: 1, clientId: 'reset-client', sent,
           send(raw) { sent.push(JSON.parse(raw)); } };
}

// Erase-scrollback (ESC[3J) is the load-bearing one: without it the trimmed
// history stays in xterm's scrollback and a cursor-up can still reach it.
//
// Only RELATIVE motion is dangerous - it is interpreted against whatever the
// client already has on screen. Absolute positioning (ESC[H) is fine, and is
// in fact the first thing the reset itself does.
const RELATIVE_MOTION = /\x1b\[[0-9;]*[ABCDEF]/;

test('a replay blob puts the screen in a known state before any buffered byte', async () => {
  const id = 'replay-reset-1';
  const { pm, emit } = await runningManager(id);
  ptyRegistry.instances.set(id, pm);
  ptyRegistry.lastAccessTime.set(id, Date.now());
  try {
    const handler = Object.create(WebSocketHandler.prototype);
    const ws = recordingWs();
    const ctx = handler.createClientContext(ws);
    ctx.setupPtyListener(id, 'claude');

    // Exactly the shape the live buffer starts with: a repaint frame whose
    // first instruction walks up ten rows that trimming already discarded.
    emit('\x1b[?25l\x1b[2D\x1b[3B\r\x1b[10ASOME_RENDERED_TEXT');
    ctx.sendReplay(pm, id);

    const blob = ws.sent.find((f) => f.type === 'replay')?.data;
    assert.ok(blob, 'a replay frame must be sent');

    // The defect, stated directly: no relative cursor motion may be interpreted
    // against rows the client still has on screen, so the screen must be reset
    // before the first one in the blob.
    const firstRelative = blob.search(RELATIVE_MOTION);
    assert.notEqual(firstRelative, -1, 'this fixture is pointless without a relative motion in it');
    assert.ok(
      blob.lastIndexOf('\x1b[3J', firstRelative) !== -1,
      `scrollback must be erased before the first relative motion (at ${firstRelative})`
    );

    // Home, erase display, erase scrollback - in that order, before anything.
    assert.match(
      blob,
      /^\x1b\[H\x1b\[2J\x1b\[3J/,
      'replay must begin with a home + erase-display + erase-scrollback reset'
    );

    // And the buffered stream must still arrive intact behind the reset.
    assert.ok(
      blob.includes('SOME_RENDERED_TEXT'),
      'the reset must precede the buffered output, not replace it'
    );
    assert.ok(
      blob.includes('\x1b[10A'),
      'the buffered bytes themselves are passed through untouched'
    );
  } finally {
    ptyRegistry.instances.delete(id);
    ptyRegistry.lastAccessTime.delete(id);
    pm.stop();
  }
});

test('a mid-session replay request is reset the same way as the handshake', async () => {
  const id = 'replay-reset-2';
  const { pm, emit } = await runningManager(id);
  ptyRegistry.instances.set(id, pm);
  ptyRegistry.lastAccessTime.set(id, Date.now());
  try {
    const handler = Object.create(WebSocketHandler.prototype);
    const ws = recordingWs();
    const ctx = handler.createClientContext(ws);
    ctx.setupPtyListener(id, 'claude');
    ctx.sendReplay(pm, id);            // handshake
    ws.sent.length = 0;

    // The Refresh button in the app takes this path, and it is the one where a
    // stale screen is guaranteed: the terminal is already full of content.
    emit('\x1b[5AREFRESHED_TEXT');
    await handler.handleMessage(ws, { type: 'replay', instanceId: id }, ctx);

    const blob = ws.sent.find((f) => f.type === 'replay')?.data;
    assert.ok(blob, 'a mid-session replay frame must be sent');
    assert.match(
      blob,
      /^\x1b\[H\x1b\[2J\x1b\[3J/,
      'Refresh must reset the screen too - this is the path with the most stale content on it'
    );
  } finally {
    ptyRegistry.instances.delete(id);
    ptyRegistry.lastAccessTime.delete(id);
    pm.stop();
  }
});
