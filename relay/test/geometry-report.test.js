const { test } = require('node:test');
const assert = require('node:assert/strict');
const WebSocketHandler = require('../src/websocket-handler');
const ptyRegistry = require('../src/pty-registry');
const logger = require('../src/logger');

// The 'geometry' frame exists because the relay has never been able to see the
// one thing that shreds a TUI's line breaks: xterm being narrower than the size
// the PTY is rendering for. Everything the relay logged was the client's own
// claim at its last resize, so a size that drifted - a dropped resize, a stale
// persisted size used at spawn - was invisible on both sides.
//
// Rendering a real 62KB Claude Code stream offline at each width gave 0 wrapped
// rows at the width it was produced for and 38 one column narrower, with box
// borders fragmenting into 26 pieces. One column is the whole margin, which is
// why this is worth a frame of its own.
//
// It is diagnostic and must stay inert: it may not resize, spawn, or otherwise
// touch a PTY. These tests pin that inertness, not the log wording.

function fakeWs() {
  return { OPEN: 1, readyState: 1, send() {}, clientId: 'c1' };
}

function fakeCtx() {
  return {
    setupPtyListener: () => {},
    sendReplay: () => {},
    skipUntilReplay: () => false,
    setSkipReplay: () => {},
  };
}

// Swaps the pino methods for recorders. Returns the captured calls plus a
// restore, so a failing assertion can never leave the logger stubbed.
function captureLogs() {
  const calls = { warn: [], info: [], debug: [] };
  const original = { warn: logger.warn, info: logger.info, debug: logger.debug };
  for (const level of Object.keys(calls)) {
    logger[level] = (detail, msg) => calls[level].push({ detail, msg });
  }
  return { calls, restore: () => Object.assign(logger, original) };
}

async function sendGeometry(instanceId, geometry) {
  const handler = Object.create(WebSocketHandler.prototype);
  const captured = captureLogs();
  try {
    await handler.handleMessage(fakeWs(), { type: 'geometry', instanceId, ...geometry }, fakeCtx());
  } finally {
    captured.restore();
  }
  return captured.calls;
}

test('a geometry frame for an unknown instance does not create one', async () => {
  const id = 'geo-unknown';
  assert.equal(ptyRegistry.has(id), false, 'precondition: instance must not exist');

  await sendGeometry(id, { cols: 57, rows: 46, wrapped: 0 });

  assert.equal(
    ptyRegistry.has(id),
    false,
    'a diagnostic frame must never spawn an instance or consume a slot against MAX_INSTANCES'
  );
});

test('xterm narrower than the PTY is reported as a mismatch with both sizes', async () => {
  const id = 'geo-mismatch';
  const pm = ptyRegistry.get(id);
  pm.lastCols = 57;
  pm.lastRows = 46;

  try {
    const { warn } = await sendGeometry(id, { cols: 56, rows: 46, wrapped: 38 });

    assert.equal(warn.length, 1, 'a disagreement must be visible at warn level');
    assert.match(warn[0].msg, /mismatch/i);
    assert.deepEqual(
      {
        xtermCols: warn[0].detail.xtermCols,
        ptyCols: warn[0].detail.ptyCols,
        wrapped: warn[0].detail.wrapped,
      },
      { xtermCols: 56, ptyCols: 57, wrapped: 38 },
      'both geometries and the artifact count must be in the record - the whole point is comparing them'
    );
  } finally {
    ptyRegistry.remove(id);
  }
});

test('agreeing geometry is not reported as a fault', async () => {
  const id = 'geo-agree';
  const pm = ptyRegistry.get(id);
  pm.lastCols = 57;
  pm.lastRows = 46;

  try {
    const { warn, info } = await sendGeometry(id, { cols: 57, rows: 46, wrapped: 0 });

    assert.equal(warn.length, 0, 'agreement must not warn, or the signal drowns');
    assert.equal(info.length, 0, 'nothing wrapped, so there is no lead to raise either');
  } finally {
    ptyRegistry.remove(id);
  }
});

// Shell output can legitimately exceed the width, so this is a lead rather
// than a fault - but it is still the count of wrapped rows on the user's
// screen, which is the artifact we are hunting.
test('wrapped rows at an agreed size are surfaced, below warn', async () => {
  const id = 'geo-wrapped';
  const pm = ptyRegistry.get(id);
  pm.lastCols = 57;
  pm.lastRows = 46;

  try {
    const { warn, info } = await sendGeometry(id, { cols: 57, rows: 46, wrapped: 12 });

    assert.equal(warn.length, 0);
    assert.equal(info.length, 1);
    assert.equal(info[0].detail.wrapped, 12);
  } finally {
    ptyRegistry.remove(id);
  }
});

// Before the first spawn or resize there is simply no PTY size on record, so a
// report is not evidence of drift. Warning here would fire on every fresh tab.
test('a report before the PTY has any size of its own is not a mismatch', async () => {
  const id = 'geo-unsized';
  const pm = ptyRegistry.get(id);
  assert.equal(pm.lastCols, undefined, 'precondition: no size recorded yet');

  try {
    const { warn } = await sendGeometry(id, { cols: 57, rows: 46, wrapped: 0 });
    assert.equal(warn.length, 0);
  } finally {
    ptyRegistry.remove(id);
  }
});

test('a geometry frame never becomes the PTY size', async () => {
  const id = 'geo-inert';
  const pm = ptyRegistry.get(id);
  pm.lastCols = 57;
  pm.lastRows = 46;
  let resized = false;
  pm.resize = () => { resized = true; };

  try {
    await sendGeometry(id, { cols: 40, rows: 20, wrapped: 9 });

    assert.equal(resized, false, 'reporting a size must not apply it');
    assert.deepEqual(
      { cols: pm.lastCols, rows: pm.lastRows },
      { cols: 57, rows: 46 },
      'the PTY size on record must be untouched by an observation of it'
    );
  } finally {
    ptyRegistry.remove(id);
  }
});
