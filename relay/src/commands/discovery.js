const fs = require('node:fs').promises;
const os = require('node:os');
const path = require('node:path');
const { discoverFileCommands } = require('./sources/files');
const { discoverClaudePlugins } = require('./sources/plugins');
const { getBuiltinCommands } = require('./sources/builtin');

const SOURCE_ORDER = ['project', 'user', 'plugin', 'extension', 'builtin'];

function sortAndGroup(commands) {
  // Sort by (source priority, name)
  return [...commands].sort((a, b) => {
    const aIdx = SOURCE_ORDER.indexOf(a.source);
    const bIdx = SOURCE_ORDER.indexOf(b.source);
    if (aIdx !== bIdx) return aIdx - bIdx;
    return a.name.localeCompare(b.name);
  });
}

async function discoverClaude({ cwd, homeDir, execAsync }) {
  const projectRoots = [
    { dir: path.join(cwd, '.claude/commands'), ext: '.md', source: 'project' },
    { dir: path.join(cwd, '.claude/skills'), skillDir: true, source: 'project' },
  ];
  const userRoots = [
    { dir: path.join(homeDir, '.claude/commands'), ext: '.md', source: 'user' },
    { dir: path.join(homeDir, '.claude/skills'), skillDir: true, source: 'user' },
  ];
  const [projectCmds, userCmds, pluginCmds] = await Promise.all([
    discoverFileCommands({ roots: projectRoots }),
    discoverFileCommands({ roots: userRoots }),
    discoverClaudePlugins({ execAsync }),
  ]);
  return [...projectCmds, ...userCmds, ...pluginCmds, ...getBuiltinCommands('claude')];
}

async function discoverAntigravity({ cwd, homeDir }) {
  const projectRoots = [
    { dir: path.join(cwd, '.gemini/commands'), ext: '.toml', source: 'project' },
    { dir: path.join(cwd, '.gemini/skills'), skillDir: true, source: 'project' },
  ];
  const userRoots = [
    { dir: path.join(homeDir, '.gemini/commands'), ext: '.toml', source: 'user' },
    { dir: path.join(homeDir, '.gemini/antigravity/skills'), skillDir: true, source: 'user' },
    { dir: path.join(homeDir, '.agents/skills'), skillDir: true, source: 'user' },
  ];
  const extDir = path.join(homeDir, '.gemini/extensions');
  const extRoots = [];
  try {
    const entries = await fs.readdir(extDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const extName = entry.name;
      extRoots.push(
        { dir: path.join(extDir, extName, 'commands'), ext: '.toml', source: 'extension', sourceLabel: extName },
        { dir: path.join(extDir, extName, 'skills'), skillDir: true, source: 'extension', sourceLabel: extName },
      );
    }
  } catch { /* extensions dir absent */ }

  const [projectCmds, userCmds, extCmds] = await Promise.all([
    discoverFileCommands({ roots: projectRoots }),
    discoverFileCommands({ roots: userRoots }),
    discoverFileCommands({ roots: extRoots }),
  ]);
  return [...projectCmds, ...userCmds, ...extCmds, ...getBuiltinCommands('antigravity')];
}

async function discoverCodex({ cwd, homeDir }) {
  // Codex uses ~/.codex/ for user config and <cwd>/.codex/ for project config.
  // Custom slash command files aren't an established convention yet, so we
  // probe likely paths and return whatever exists alongside builtins.
  const projectRoots = [
    { dir: path.join(cwd, '.codex/commands'), ext: '.md', source: 'project' },
    { dir: path.join(cwd, '.codex/skills'), skillDir: true, source: 'project' },
  ];
  const userRoots = [
    { dir: path.join(homeDir, '.codex/commands'), ext: '.md', source: 'user' },
    { dir: path.join(homeDir, '.codex/skills'), skillDir: true, source: 'user' },
  ];
  const [projectCmds, userCmds] = await Promise.all([
    discoverFileCommands({ roots: projectRoots }),
    discoverFileCommands({ roots: userRoots }),
  ]);
  return [...projectCmds, ...userCmds, ...getBuiltinCommands('codex')];
}

async function discoverCommands({ cwd, cliType, homeDir = os.homedir(), execAsync }) {
  let all = [];
  if (cliType === 'claude') {
    all = await discoverClaude({ cwd, homeDir, execAsync });
  } else if (cliType === 'antigravity') {
    all = await discoverAntigravity({ cwd, homeDir });
  } else if (cliType === 'codex') {
    all = await discoverCodex({ cwd, homeDir });
  } else {
    return [];
  }
  return sortAndGroup(all);
}

module.exports = { discoverCommands };
