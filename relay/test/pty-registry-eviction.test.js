const { test } = require('node:test');
const assert = require('node:assert/strict');
const ptyRegistry = require('../src/pty-registry');

test('removeOldestIdle does not evict a manager that is starting', () => {
  const pm = ptyRegistry.get('evict-busy-test', '/tmp', 'claude');
  pm.status = 'starting';           // mid self-update
  pm.listeners.clear();             // its only client went away

  const evicted = ptyRegistry.removeOldestIdle();
  assert.equal(evicted, false, 'a starting manager is not idle');
  assert.ok(ptyRegistry.get('evict-busy-test'), 'manager must still be registered');

  pm.status = 'stopped';
  ptyRegistry.remove('evict-busy-test');
});

test('removeOldestIdle still evicts a stopped, listener-less manager', () => {
  const pm = ptyRegistry.get('evict-idle-test', '/tmp', 'claude');
  pm.status = 'stopped';
  pm.listeners.clear();

  assert.equal(ptyRegistry.removeOldestIdle(), true);
});
