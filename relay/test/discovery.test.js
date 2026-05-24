const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const { discoverCommands } = require('../src/commands/discovery');
const { _clearCache } = require('../src/commands/sources/plugins');

const CLAUDE_FIXTURE = path.join(__dirname, 'fixtures/cmd-discovery/claude-project');
const AGY_FIXTURE = path.join(__dirname, 'fixtures/cmd-discovery/agy-project');

test('discoverCommands(claude) returns project + builtin sources', async () => {
  _clearCache();
  const cmds = await discoverCommands({
    cwd: CLAUDE_FIXTURE,
    cliType: 'claude',
    homeDir: os.tmpdir(),                       // no user-level files
    execAsync: async () => ({ stdout: '[]' }),  // no plugins
  });
  const sources = new Set(cmds.map(c => c.source));
  assert.ok(sources.has('project'), 'should include project');
  assert.ok(sources.has('builtin'), 'should include builtin');
  const project = cmds.filter(c => c.source === 'project').map(c => c.name).sort();
  assert.ok(project.includes('review'));
  assert.ok(project.includes('git:commit'));
  assert.ok(project.includes('summarize'));  // skill
});

test('discoverCommands(antigravity) returns project + builtin sources', async () => {
  const cmds = await discoverCommands({
    cwd: AGY_FIXTURE,
    cliType: 'antigravity',
    homeDir: os.tmpdir(),
    execAsync: async () => ({ stdout: '[]' }),
  });
  const project = cmds.filter(c => c.source === 'project').map(c => c.name).sort();
  assert.ok(project.includes('test'));
  assert.ok(project.includes('git:commit'));
  assert.ok(project.includes('explain'));  // skill
  const builtin = cmds.filter(c => c.source === 'builtin');
  assert.ok(builtin.some(c => c.name === 'goal'));
});

test('discoverCommands sorts within each source alphabetically by name', async () => {
  const cmds = await discoverCommands({
    cwd: CLAUDE_FIXTURE,
    cliType: 'claude',
    homeDir: os.tmpdir(),
    execAsync: async () => ({ stdout: '[]' }),
  });
  const project = cmds.filter(c => c.source === 'project').map(c => c.name);
  const sortedProject = [...project].sort();
  assert.deepEqual(project, sortedProject);
});

test('discoverCommands returns empty for unknown cliType', async () => {
  const cmds = await discoverCommands({
    cwd: CLAUDE_FIXTURE,
    cliType: 'banana',
    homeDir: os.tmpdir(),
    execAsync: async () => ({ stdout: '[]' }),
  });
  assert.deepEqual(cmds, []);
});

test('discoverCommands tolerates missing cwd entirely', async () => {
  const cmds = await discoverCommands({
    cwd: '/nonexistent/path',
    cliType: 'claude',
    homeDir: os.tmpdir(),
    execAsync: async () => ({ stdout: '[]' }),
  });
  assert.ok(cmds.some(c => c.source === 'builtin'));
});
