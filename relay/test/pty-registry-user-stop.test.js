const { test } = require('node:test');
const assert = require('node:assert/strict');
const ptyRegistry = require('../src/pty-registry');

// DELETE /api/instances[/:id] calls remove() with userInitiated: true, which
// stop()s and deletes the PtyManager entirely. The manager's own
// stoppedByUser flag dies with it, so the registry must remember the
// decision itself - otherwise the next get() (from set-instance) builds a
// brand-new manager with stoppedByUser defaulting back to false, and the
// deferred-start bug this branch fixes comes right back.

test('a user-initiated remove seeds stoppedByUser=true on the manager the next get() creates', () => {
  const id = 'user-stop-test';
  ptyRegistry.get(id, '/tmp', 'claude');

  const removed = ptyRegistry.remove(id, { userInitiated: true });
  assert.equal(removed, true);

  const fresh = ptyRegistry.get(id);
  assert.equal(fresh.stoppedByUser, true, 'a brand-new manager for a user-stopped id must start out declining auto-start');

  ptyRegistry.remove(id, { userInitiated: true }); // cleanup
});

// This is the distinction the whole fix hinges on: eviction for being idle,
// or to make room under MAX_INSTANCES, is NOT the user stopping the session.
// If this ever regressed to recording those removals too, an instance that
// merely went idle would stop being able to auto-start on the next
// set-instance - a correctness break for ordinary usage, not a fix.
test('an idle-evicted id (non-user-initiated remove) still auto-starts normally', () => {
  const id = 'idle-evict-test';
  const pm = ptyRegistry.get(id, '/tmp', 'claude');
  pm.status = 'stopped';
  pm.listeners.clear();

  // Same remove() call cleanupIdleInstances()/removeOldestIdle() make
  // internally - no userInitiated option, so the default (false) applies.
  // The next test exercises cleanupIdleInstances() itself end-to-end.
  const removed = ptyRegistry.remove(id);
  assert.equal(removed, true);

  const fresh = ptyRegistry.get(id);
  assert.equal(fresh.stoppedByUser, false, 'idle eviction must not poison the next manager for this id');

  ptyRegistry.remove(id);
});

test('cleanupIdleInstances() evicts an idle manager without recording user-stop', () => {
  const id = 'idle-cleanup-test';
  const pm = ptyRegistry.get(id, '/tmp', 'claude');
  pm.status = 'stopped';
  pm.listeners.clear();
  // Force the id to look idle past the 30-minute housekeeping timeout
  // without waiting on a real timer.
  ptyRegistry.lastAccessTime.set(id, Date.now() - 31 * 60 * 1000);

  ptyRegistry.cleanupIdleInstances();
  assert.equal(ptyRegistry.has(id), false, 'the idle manager must have been evicted');

  const fresh = ptyRegistry.get(id);
  assert.equal(fresh.stoppedByUser, false, 'cleanupIdleInstances must not mark the id as user-stopped');

  ptyRegistry.remove(id);
});

test('clearUserStop() clears a recorded stop so a later get() does not seed it', () => {
  const id = 'clear-user-stop-test';
  ptyRegistry.get(id, '/tmp', 'claude');
  ptyRegistry.remove(id, { userInitiated: true });

  ptyRegistry.clearUserStop(id);

  const fresh = ptyRegistry.get(id);
  assert.equal(fresh.stoppedByUser, false, 'clearUserStop must let the id auto-start again');

  ptyRegistry.remove(id);
});

test('clearUserStop() is a no-op for an id that was never recorded', () => {
  assert.doesNotThrow(() => ptyRegistry.clearUserStop('never-stopped-id'));
});
