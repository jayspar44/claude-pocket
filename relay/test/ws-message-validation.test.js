const { test } = require('node:test');
const assert = require('node:assert/strict');
const WebSocketHandler = require('../src/websocket-handler');

test('parseClientFrame accepts a plain object', () => {
  assert.deepEqual(
    WebSocketHandler.parseClientFrame('{"type":"ping"}'),
    { ok: true, message: { type: 'ping' } }
  );
});

test('parseClientFrame rejects null, which JSON.parse accepts', () => {
  assert.deepEqual(
    WebSocketHandler.parseClientFrame('null'),
    { ok: false, reason: 'not-an-object' }
  );
});

test('parseClientFrame rejects numbers, strings and arrays', () => {
  for (const raw of ['42', '"str"', '[1,2]', 'true']) {
    const result = WebSocketHandler.parseClientFrame(raw);
    assert.deepEqual(result, { ok: false, reason: 'not-an-object' }, `raw=${raw}`);
  }
});

test('parseClientFrame rejects malformed JSON', () => {
  assert.deepEqual(
    WebSocketHandler.parseClientFrame('{bad json'),
    { ok: false, reason: 'invalid-json' }
  );
});
