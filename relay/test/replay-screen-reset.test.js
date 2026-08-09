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
//   2. the client's terminal.clear() does not reset cursor state. It drops
//      scrollback, but leaves the cursor's row and column where they were - so
//      the blob is written into whatever position the last live frame left.
//
// A repaint whose cursor-up cannot travel above row 0 lands BELOW the block it
// meant to overwrite, so both copies stay on screen. That is the duplicated
// paragraph seen on the dev build. Neither cause is fixable inside the buffer,
// so the replay blob has to arrive with the screen put into a known state.
//
// "Known state" means more than erasing. The blob is a mid-stream capture whose
// own mode-setting prefix was trimmed off the front, so it assumes: the main
// screen buffer, no scroll region, and default colours. Each has to be restored
// explicitly or the erase itself misbehaves - ESC[2J fills with the CURRENT
// background, so an erase under a live highlight paints every row in it.

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

// Order matters and is asserted as a whole: leave the alternate buffer, drop
// the scroll region, reset colours, THEN home and erase. Erasing before the
// SGR reset would fill the screen with the live stream's background colour,
// and homing inside a surviving scroll region does not reach row 0.
const RESET = '\x1b[?1049l\x1b[r\x1b[0m\x1b[H\x1b[2J\x1b[3J';

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

    assert.ok(
      blob.startsWith(RESET),
      `replay must begin with the full reset, began with ${JSON.stringify(blob.slice(0, 24))}`
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
    assert.ok(
      blob.startsWith(RESET),
      'Refresh must reset the screen too - this is the path with the most stale content on it'
    );
  } finally {
    ptyRegistry.instances.delete(id);
    ptyRegistry.lastAccessTime.delete(id);
    pm.stop();
  }
});
