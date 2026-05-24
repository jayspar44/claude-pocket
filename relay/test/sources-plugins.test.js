const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { discoverClaudePlugins, _clearCache } = require('../src/commands/sources/plugins');

test('discoverClaudePlugins skips disabled plugins', async () => {
  _clearCache();
  const fakeExec = async () => ({
    stdout: JSON.stringify([
      { id: 'p1@m', enabled: false, installPath: '/nonexistent' },
    ]),
  });
  const cmds = await discoverClaudePlugins({ execAsync: fakeExec });
  assert.deepEqual(cmds, []);
});

test('discoverClaudePlugins returns [] if claude CLI not present', async () => {
  _clearCache();
  const fakeExec = async () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; };
  const cmds = await discoverClaudePlugins({ execAsync: fakeExec });
  assert.deepEqual(cmds, []);
});

test('discoverClaudePlugins caches results for 60 seconds', async () => {
  _clearCache();
  let calls = 0;
  const fakeExec = async () => { calls++; return { stdout: '[]' }; };
  await discoverClaudePlugins({ execAsync: fakeExec });
  await discoverClaudePlugins({ execAsync: fakeExec });
  await discoverClaudePlugins({ execAsync: fakeExec });
  assert.equal(calls, 1);
});

test('discoverClaudePlugins namespaces commands as <plugin>:<name>', async () => {
  _clearCache();
  const pluginPath = path.join(__dirname, 'fixtures/cmd-discovery/fake-plugin');
  const fs = require('node:fs').promises;
  await fs.mkdir(path.join(pluginPath, 'commands'), { recursive: true });
  await fs.writeFile(path.join(pluginPath, 'commands', 'hello.md'),
    `---\ndescription: hello plugin\n---\n`);
  const fakeExec = async () => ({
    stdout: JSON.stringify([{ id: 'demo@m', enabled: true, installPath: pluginPath }]),
  });
  const cmds = await discoverClaudePlugins({ execAsync: fakeExec });
  const names = cmds.map(c => c.name);
  assert.ok(names.includes('demo:hello'), `expected demo:hello, got ${JSON.stringify(names)}`);
  const hello = cmds.find(c => c.name === 'demo:hello');
  assert.equal(hello.source, 'plugin');
  assert.equal(hello.sourceLabel, 'demo');
  await fs.rm(pluginPath, { recursive: true });
});
