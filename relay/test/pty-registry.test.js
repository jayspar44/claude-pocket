const { test } = require('node:test');
const assert = require('node:assert/strict');
const ptyRegistry = require('../src/pty-registry');

test('cleanup interval is unref-ed so it never keeps the process alive on its own', () => {
  assert.equal(ptyRegistry.cleanupInterval.hasRef(), false);
});
