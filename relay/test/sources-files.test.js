const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { discoverFileCommands } = require('../src/commands/sources/files');

const CLAUDE_FIXTURE = path.join(__dirname, 'fixtures/cmd-discovery/claude-project');
const AGY_FIXTURE = path.join(__dirname, 'fixtures/cmd-discovery/agy-project');

test('discoverFileCommands finds markdown commands in .claude/commands', async () => {
  const cmds = await discoverFileCommands({
    roots: [{ dir: path.join(CLAUDE_FIXTURE, '.claude/commands'), ext: '.md', source: 'project' }],
  });
  const names = cmds.map(c => c.name).sort();
  assert.deepEqual(names, ['git:commit', 'review']);
  const review = cmds.find(c => c.name === 'review');
  assert.equal(review.description, 'Review the current branch');
  assert.equal(review.argumentHint, '<branch>');
  assert.equal(review.source, 'project');
  assert.equal(review.namespace, null);
  const commit = cmds.find(c => c.name === 'git:commit');
  assert.equal(commit.namespace, 'git');
});

test('discoverFileCommands finds SKILL.md skills with directory-as-name', async () => {
  const cmds = await discoverFileCommands({
    roots: [{ dir: path.join(CLAUDE_FIXTURE, '.claude/skills'), skillDir: true, source: 'project' }],
  });
  assert.equal(cmds.length, 1);
  assert.equal(cmds[0].name, 'summarize');
  assert.equal(cmds[0].isSkill, true);
  assert.equal(cmds[0].description, 'Summarize the working tree');
});

test('discoverFileCommands finds TOML commands in .gemini/commands', async () => {
  const cmds = await discoverFileCommands({
    roots: [{ dir: path.join(AGY_FIXTURE, '.gemini/commands'), ext: '.toml', source: 'project' }],
  });
  const names = cmds.map(c => c.name).sort();
  assert.deepEqual(names, ['git:commit', 'test']);
  const t = cmds.find(c => c.name === 'test');
  assert.equal(t.description, 'Run the test suite');
  assert.equal(t.argumentHint, '[--watch]');
});

test('discoverFileCommands returns [] for missing directory', async () => {
  const cmds = await discoverFileCommands({
    roots: [{ dir: '/tmp/this-path-does-not-exist-xyz', ext: '.md', source: 'user' }],
  });
  assert.deepEqual(cmds, []);
});

test('discoverFileCommands applies sourceLabel when provided', async () => {
  const cmds = await discoverFileCommands({
    roots: [{ dir: path.join(CLAUDE_FIXTURE, '.claude/commands'), ext: '.md', source: 'plugin', sourceLabel: 'my-plugin' }],
  });
  for (const c of cmds) assert.equal(c.sourceLabel, 'my-plugin');
});
