const { test } = require('node:test');
const assert = require('node:assert/strict');
const ptyRegistry = require('../src/pty-registry');
const WebSocketHandler = require('../src/websocket-handler');

// A remembered stop is honoured indefinitely and keyed on the instance id
// alone. Every generated id is unique per tab, but the bootstrap tab uses the
// literal 'default', which every install pointed at this relay shares. So the
// client that meets the decline need not be the one that made the stop: a
// reinstall, Settings -> Reset App Data, or the app on a second phone all
// bootstrap a fresh 'default' tab and meet a record they know nothing about.
// The relay keeps declining - that is the decision working as intended - but it
// must say so, because an idle terminal with no explanation reads as a broken
// relay, and the control that fixes it (Start, which clears the record) is
// behind a menu.
//
// The ordering matters as much as the message: the client clears ptyError on
// any pty-status, and sendReplay ends with one, so a notice sent before the
// replay is wiped by the status that follows it. Same hazard, and same fix, as
// the missing-working-dir error.

function recorder() {
  const sent = [];
  const ws = {
    OPEN: 1,
    readyState: 1,
    clientId: 'fake-client',
    send(raw) { sent.push(JSON.parse(raw)); },
  };
  const ctx = {
    setSkipReplay() {},
    setupPtyListener: (id) => ptyRegistry.get(id),
    // Stands in for the real sendReplay, which ends by sending a pty-status -
    // the frame that clears ptyError on the client.
    sendReplay: () => ws.send(JSON.stringify({ type: 'pty-status', fromReplay: true })),
  };
  return { sent, ws, ctx };
}

test('a set-instance declined by a remembered stop tells the client why, after the replay', async () => {
  const id = 'default';
  // The exact production sequence: the user stops the default session, the
  // manager is gone, and much later a client - not necessarily the same one -
  // connects a fresh 'default' tab.
  ptyRegistry.get(id, '/tmp', 'claude');
  ptyRegistry.remove(id, { userInitiated: true });

  const { sent, ws, ctx } = recorder();
  const handler = Object.create(WebSocketHandler.prototype);
  await handler.handleSetInstance(ws, {
    type: 'set-instance', instanceId: id, workingDir: '/tmp', cols: 92, rows: 40,
  }, ctx);

  assert.equal(ptyRegistry.get(id).stoppedByUser, true, 'the stop must still be honoured');

  const notice = sent.filter((m) => m.type === 'pty-error');
  assert.equal(notice.length, 1, 'the client must be told why nothing started');
  assert.match(notice[0].message, /Start/, 'the notice must name the control that recovers');
  assert.equal(notice[0].instanceId, id);
  assert.equal(notice[0].handshakeFailed, undefined,
    'the instance is bound and usable - this explains an idle terminal, it does not refuse the connection');
  assert.equal(sent[sent.length - 1].type, 'pty-error',
    'a pty-status after the notice would clear it on the client');

  ptyRegistry.remove(id);
  ptyRegistry.clearUserStop(id);
});

test('an ordinary set-instance that arms a start sends no such notice', async () => {
  const id = 'stopped-notice-ok';
  const { sent, ws, ctx } = recorder();
  const handler = Object.create(WebSocketHandler.prototype);

  await handler.handleSetInstance(ws, {
    type: 'set-instance', instanceId: id, workingDir: '/tmp', cols: 92, rows: 40,
  }, ctx);

  // The deferred-start fallback timer is real; drop it so the suite still
  // exits on its own and nothing spawns a CLI three seconds from now.
  clearTimeout(ws._deferredStartTimer);
  ws._deferredStartTimer = null;

  assert.equal(sent.filter((m) => m.type === 'pty-error').length, 0,
    'a session nobody stopped must not be reported as stopped');
  assert.equal(ptyRegistry.get(id).deferredStartDir, '/tmp', 'the ordinary path must still arm the start');

  ptyRegistry.remove(id);
});
