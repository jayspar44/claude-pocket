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

// get() used to stamp lastAccessTime before the capacity check, so an id it
// then refused to create left a timestamp behind. Nothing collects that:
// remove() deletes from lastAccessTime only when it found a matching instance,
// and cleanupIdleInstances() skips entries with no instance (`instance &&`).
// The map therefore grew by one entry per rejected connect for the life of the
// relay process - the same unbounded-growth defect this branch fixed one map
// over. lastAccessTime must only ever hold keys that this.instances holds.
test('a get() rejected by the instance cap leaves no lastAccessTime entry behind', () => {
  const config = require('../src/config');
  const created = [];
  // Fill to the cap with instances that cannot be evicted (busy).
  for (let i = ptyRegistry.getInstanceCount(); i < config.pty.maxInstances; i++) {
    const id = `cap-filler-${i}`;
    const pm = ptyRegistry.get(id, '/tmp', 'claude');
    pm.status = 'running';
    created.push(id);
  }

  const before = ptyRegistry.lastAccessTime.size;
  assert.throws(() => ptyRegistry.get('cap-rejected', '/tmp', 'claude'), /Maximum instances/);

  assert.equal(ptyRegistry.lastAccessTime.has('cap-rejected'), false,
    'a rejected id must leave no uncollectable timestamp');
  assert.equal(ptyRegistry.lastAccessTime.size, before, 'the map must not have grown');

  for (const id of created) {
    ptyRegistry.instances.get(id).status = 'stopped';
    ptyRegistry.remove(id);
  }
  // The invariant the fix establishes, checked directly.
  for (const id of ptyRegistry.lastAccessTime.keys()) {
    assert.ok(ptyRegistry.instances.has(id), `orphaned lastAccessTime entry: ${id}`);
  }
});
