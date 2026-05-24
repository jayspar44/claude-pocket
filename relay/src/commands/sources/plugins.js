const { exec } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const { discoverFileCommands } = require('./files');
const logger = require('../../logger');

const defaultExecAsync = promisify(exec);

const CACHE_TTL_MS = 60 * 1000;
let cache = { at: 0, value: null };

function _clearCache() {
  cache = { at: 0, value: null };
}

async function discoverClaudePlugins({ execAsync = defaultExecAsync } = {}) {
  const now = Date.now();
  if (cache.value && now - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }

  let plugins;
  try {
    const { stdout } = await execAsync('claude plugin list --json', { timeout: 5000 });
    plugins = JSON.parse(stdout);
  } catch (err) {
    logger.warn({ err: err.message }, 'claude plugin list failed; skipping plugin discovery');
    cache = { at: now, value: [] };
    return [];
  }

  const results = [];
  for (const p of plugins) {
    if (!p.enabled) continue;
    const pluginName = String(p.id || '').split('@')[0];
    if (!p.installPath || !pluginName) continue;

    const cmds = await discoverFileCommands({
      roots: [
        { dir: path.join(p.installPath, 'commands'), ext: '.md', source: 'plugin', sourceLabel: pluginName },
        { dir: path.join(p.installPath, 'skills'), skillDir: true, source: 'plugin', sourceLabel: pluginName },
      ],
    });
    // Prefix every plugin command with the plugin name. Subdir-derived
    // namespaces remain in the tail (e.g. <plugin>:git:commit).
    for (const c of cmds) {
      c.name = `${pluginName}:${c.name}`;
      c.namespace = pluginName;
    }
    results.push(...cmds);
  }

  cache = { at: now, value: results };
  return results;
}

module.exports = { discoverClaudePlugins, _clearCache };
