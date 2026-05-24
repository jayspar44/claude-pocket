const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getBuiltinCommands } = require('../src/commands/sources/builtin');

test('getBuiltinCommands returns claude commands with source=builtin', () => {
  const cmds = getBuiltinCommands('claude');
  assert.ok(cmds.length >= 80, `expected 80+ commands, got ${cmds.length}`);
  for (const c of cmds) {
    assert.equal(c.source, 'builtin');
    assert.equal(typeof c.name, 'string');
    assert.ok(c.name.length > 0);
    assert.equal(typeof c.description, 'string');
  }
});

test('getBuiltinCommands returns antigravity commands with source=builtin', () => {
  const cmds = getBuiltinCommands('antigravity');
  assert.ok(cmds.length >= 30);
  for (const c of cmds) assert.equal(c.source, 'builtin');
});

test('getBuiltinCommands returns empty list for unknown cliType', () => {
  assert.deepEqual(getBuiltinCommands('unknown'), []);
});

test('getBuiltinCommands does not leak internal lineage field for agy', () => {
  const cmds = getBuiltinCommands('antigravity');
  for (const c of cmds) {
    assert.equal(c.lineage, undefined, `command ${c.name} leaks lineage`);
  }
});
