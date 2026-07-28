const { test } = require('node:test');
const assert = require('node:assert/strict');

// `parseInt(process.env.MAX_INSTANCES || '10', 10)` yields NaN for any
// non-numeric value, and `this.instances.size >= NaN` is always false - so a
// typo in the environment silently removes the instance cap entirely and
// /api/health serialises maxInstances as null.

const CONFIG_PATH = require.resolve('../src/config');

function loadConfigWith(value) {
  const previous = process.env.MAX_INSTANCES;
  if (value === undefined) {
    delete process.env.MAX_INSTANCES;
  } else {
    process.env.MAX_INSTANCES = value;
  }
  delete require.cache[CONFIG_PATH];
  try {
    return require('../src/config');
  } finally {
    if (previous === undefined) {
      delete process.env.MAX_INSTANCES;
    } else {
      process.env.MAX_INSTANCES = previous;
    }
    delete require.cache[CONFIG_PATH];
  }
}

test('a non-numeric MAX_INSTANCES falls back to the default cap', () => {
  const cfg = loadConfigWith('abc');
  assert.equal(cfg.pty.maxInstances, 10, 'a garbage value must not disable the cap');
  assert.equal(Number.isNaN(cfg.pty.maxInstances), false);
  // The cap is used as `size >= maxInstances`; NaN makes that always false.
  assert.equal(0 >= cfg.pty.maxInstances, false);
  assert.equal(10 >= cfg.pty.maxInstances, true, 'the cap must actually bind');
  // JSON.stringify turns NaN into null - what /api/health reported.
  assert.equal(JSON.parse(JSON.stringify({ m: cfg.pty.maxInstances })).m, 10);
});

test('an empty or unset MAX_INSTANCES falls back to the default cap', () => {
  assert.equal(loadConfigWith(undefined).pty.maxInstances, 10);
  assert.equal(loadConfigWith('').pty.maxInstances, 10);
});

test('a numeric MAX_INSTANCES is honoured', () => {
  assert.equal(loadConfigWith('3').pty.maxInstances, 3);
});
