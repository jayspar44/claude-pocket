# Slash Command Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile app's slash-command UI (existing bottom-sheet CommandPalette + new inline `/` autocomplete) CLI-aware and dynamic, surfacing project/user/plugin/extension/built-in commands for both `claude` and `agy` instances.

**Architecture:** Relay (Node 22 + Express) walks filesystem command/skill directories per CLI, shells out to `claude plugin list --json` for plugin enumeration, and serves a merged list from `GET /api/commands`. Built-in commands ship as static JSON fallback (`relay/src/commands/builtins/*.json`). App-side, a new `useCommands` hook is the single source of truth for both the updated CommandPalette and the new CommandAutocomplete component anchored above the InputBar.

**Tech Stack:** Relay — Node 22 (built-in `node:test`), Express 5, CommonJS, Pino. App — React 19, Vite 7, Tailwind 4, axios.

**Spec:** `docs/superpowers/specs/2026-05-24-slash-command-discovery-design.md`

**Scraped fallback data (committed):** `docs/superpowers/specs/2026-05-24-slash-command-discovery/{claude,antigravity}-builtins.json`

---

## File Structure

### Relay (new files)

```
relay/
├── src/
│   └── commands/
│       ├── discovery.js                    # orchestrator
│       ├── parsers.js                      # markdown frontmatter + minimal TOML
│       ├── sources/
│       │   ├── files.js                    # filesystem walker
│       │   ├── plugins.js                  # `claude plugin list --json` + walk
│       │   └── builtin.js                  # loads builtins/*.json
│       └── builtins/
│           ├── claude.json                 # copied from spec dir
│           └── antigravity.json            # copied from spec dir
└── test/
    ├── parsers.test.js
    ├── sources-files.test.js
    ├── sources-builtin.test.js
    ├── discovery.test.js
    └── fixtures/
        └── cmd-discovery/
            ├── claude-project/.claude/commands/{review.md,deploy.md,git/commit.md}
            ├── claude-project/.claude/skills/summarize/SKILL.md
            ├── agy-project/.gemini/commands/{test.toml,git/commit.toml}
            └── agy-project/.gemini/skills/explain/SKILL.md
```

### Relay (modified)

- `relay/src/routes/commands.js` — slimmed down to call `discovery.js`
- `relay/package.json` — add `"test": "node --test test/"` script

### App (new files)

```
app/src/
├── hooks/
│   └── useCommands.js                      # data hook (replaces in-component fetch)
└── components/
    ├── command/
    │   ├── CommandPalette.jsx              # MODIFIED: uses hook, source badges
    │   └── (unchanged: index.js)
    └── input/
        ├── CommandAutocomplete.jsx         # NEW: inline / typeahead
        └── InputBar.jsx                    # MODIFIED: caret + value callbacks
```

### App (deleted)

- `app/src/constants/system-commands.js` — built-ins now come from server

---

## Task 1: Set up Node test runner in relay

**Files:**
- Modify: `relay/package.json`
- Create: `relay/test/.gitkeep`

- [ ] **Step 1: Add a test script using Node's built-in test runner**

Edit `relay/package.json`. Replace the `"test"` line in `scripts`:

```json
"test": "node --test test/"
```

- [ ] **Step 2: Create the test directory**

```bash
mkdir -p relay/test/fixtures/cmd-discovery
touch relay/test/.gitkeep
```

- [ ] **Step 3: Run tests to confirm runner works (will report no tests)**

Run: `npm test --prefix relay`
Expected: exits 0 with `tests 0` reported. If it fails with "ENOENT" or similar, the path is wrong — re-check.

- [ ] **Step 4: Commit**

```bash
git add relay/package.json relay/test/.gitkeep
git commit -m "test(relay): wire up node:test runner"
```

---

## Task 2: Parsers — markdown frontmatter + TOML

**Files:**
- Create: `relay/src/commands/parsers.js`
- Test: `relay/test/parsers.test.js`

- [ ] **Step 1: Write the failing tests**

Create `relay/test/parsers.test.js`:

```javascript
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseMarkdown, parseToml } = require('../src/commands/parsers');

test('parseMarkdown extracts description from YAML frontmatter', () => {
  const md = `---
description: Reviews the current branch
---

# Some heading
Body content`;
  assert.deepEqual(parseMarkdown(md), { description: 'Reviews the current branch', argumentHint: null });
});

test('parseMarkdown extracts argument-hint from frontmatter', () => {
  const md = `---
description: Fix an issue
argument-hint: <issue-number>
---
body`;
  assert.deepEqual(parseMarkdown(md), { description: 'Fix an issue', argumentHint: '<issue-number>' });
});

test('parseMarkdown also accepts argumentHint (camelCase)', () => {
  const md = `---
description: foo
argumentHint: [opt]
---`;
  assert.equal(parseMarkdown(md).argumentHint, '[opt]');
});

test('parseMarkdown falls back to first # heading when no description', () => {
  const md = `# Heading text\n\nbody`;
  assert.equal(parseMarkdown(md).description, 'Heading text');
});

test('parseMarkdown returns empty description for empty content', () => {
  assert.deepEqual(parseMarkdown(''), { description: '', argumentHint: null });
});

test('parseMarkdown handles malformed frontmatter without crashing', () => {
  const md = `---\nthis is not yaml\n`;
  const out = parseMarkdown(md);
  assert.equal(typeof out.description, 'string');
});

test('parseToml extracts description and argument-hint', () => {
  const toml = `description = "Run the test suite"
argument-hint = "[--watch]"
prompt = """
multi
line
"""`;
  assert.deepEqual(parseToml(toml), { description: 'Run the test suite', argumentHint: '[--watch]' });
});

test('parseToml handles single quotes and missing argumentHint', () => {
  const toml = `description = 'hello world'\nprompt = "ignored"`;
  assert.deepEqual(parseToml(toml), { description: 'hello world', argumentHint: null });
});

test('parseToml returns empty description when key missing', () => {
  assert.deepEqual(parseToml('prompt = "x"'), { description: '', argumentHint: null });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix relay`
Expected: FAIL with "Cannot find module '../src/commands/parsers'".

- [ ] **Step 3: Create the parsers module**

Create `relay/src/commands/parsers.js`:

```javascript
function parseMarkdown(content) {
  if (!content) return { description: '', argumentHint: null };

  let description = '';
  let argumentHint = null;

  // YAML frontmatter (--- ... ---)
  if (content.startsWith('---')) {
    const end = content.indexOf('---', 3);
    if (end !== -1) {
      const fm = content.slice(3, end);
      const descMatch = fm.match(/^description:\s*(.+)$/m);
      if (descMatch) description = descMatch[1].trim();
      const hintMatch = fm.match(/^(?:argument-hint|argumentHint):\s*(.+)$/m);
      if (hintMatch) argumentHint = hintMatch[1].trim();
    }
  }

  // Fallback: first # heading
  if (!description) {
    for (const line of content.split('\n')) {
      if (line.startsWith('# ')) {
        description = line.slice(2).trim();
        break;
      }
    }
  }

  return { description, argumentHint };
}

function parseToml(content) {
  if (!content) return { description: '', argumentHint: null };

  const extract = (key) => {
    // Match: key = "value"  or  key = 'value'  (single-line only)
    const re = new RegExp(`^${key}\\s*=\\s*(?:"([^"\\n]*)"|'([^'\\n]*)')\\s*$`, 'm');
    const m = content.match(re);
    return m ? (m[1] ?? m[2]) : null;
  };

  return {
    description: extract('description') || '',
    argumentHint: extract('argument-hint') || extract('argumentHint') || null,
  };
}

module.exports = { parseMarkdown, parseToml };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix relay`
Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add relay/src/commands/parsers.js relay/test/parsers.test.js
git commit -m "feat(relay): add markdown frontmatter + toml parsers for command discovery"
```

---

## Task 3: Copy built-in JSON fallback files into the relay

**Files:**
- Create: `relay/src/commands/builtins/claude.json` (copy from spec dir)
- Create: `relay/src/commands/builtins/antigravity.json` (copy from spec dir)
- Create: `relay/src/commands/sources/builtin.js`
- Test: `relay/test/sources-builtin.test.js`

- [ ] **Step 1: Copy the scraped JSON files**

```bash
mkdir -p relay/src/commands/builtins
cp docs/superpowers/specs/2026-05-24-slash-command-discovery/claude-builtins.json relay/src/commands/builtins/claude.json
cp docs/superpowers/specs/2026-05-24-slash-command-discovery/antigravity-builtins.json relay/src/commands/builtins/antigravity.json
```

- [ ] **Step 2: Sanity-check counts**

Run:
```bash
node -e "console.log('claude:', require('./relay/src/commands/builtins/claude.json').length)"
node -e "console.log('agy:', require('./relay/src/commands/builtins/antigravity.json').length)"
```
Expected:
```
claude: 91
agy: 42
```

- [ ] **Step 3: Write the failing test**

Create `relay/test/sources-builtin.test.js`:

```javascript
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
  assert.ok(cmds.length >= 40);
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
```

- [ ] **Step 4: Run tests to verify failure**

Run: `npm test --prefix relay`
Expected: FAIL with "Cannot find module '../src/commands/sources/builtin'".

- [ ] **Step 5: Create the builtin source module**

Create `relay/src/commands/sources/builtin.js`:

```javascript
const claudeBuiltins = require('../builtins/claude.json');
const antigravityBuiltins = require('../builtins/antigravity.json');

const TABLES = {
  claude: claudeBuiltins,
  antigravity: antigravityBuiltins,
};

function getBuiltinCommands(cliType) {
  const table = TABLES[cliType];
  if (!table) return [];
  return table.map((row) => ({
    name: row.name,
    namespace: null,
    source: 'builtin',
    sourceLabel: null,
    description: row.description || '',
    argumentHint: row.argumentHint ?? null,
    isSkill: row.isSkill === true,
  }));
}

module.exports = { getBuiltinCommands };
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test --prefix relay`
Expected: 4 new tests pass.

- [ ] **Step 7: Commit**

```bash
git add relay/src/commands/builtins/ relay/src/commands/sources/builtin.js relay/test/sources-builtin.test.js
git commit -m "feat(relay): ship built-in command tables for claude + agy"
```

---

## Task 4: File-based discovery — fixtures

**Files:**
- Create: `relay/test/fixtures/cmd-discovery/claude-project/.claude/commands/review.md`
- Create: `relay/test/fixtures/cmd-discovery/claude-project/.claude/commands/git/commit.md`
- Create: `relay/test/fixtures/cmd-discovery/claude-project/.claude/skills/summarize/SKILL.md`
- Create: `relay/test/fixtures/cmd-discovery/agy-project/.gemini/commands/test.toml`
- Create: `relay/test/fixtures/cmd-discovery/agy-project/.gemini/commands/git/commit.toml`
- Create: `relay/test/fixtures/cmd-discovery/agy-project/.gemini/skills/explain/SKILL.md`

- [ ] **Step 1: Create the directory tree**

```bash
mkdir -p relay/test/fixtures/cmd-discovery/claude-project/.claude/commands/git
mkdir -p relay/test/fixtures/cmd-discovery/claude-project/.claude/skills/summarize
mkdir -p relay/test/fixtures/cmd-discovery/agy-project/.gemini/commands/git
mkdir -p relay/test/fixtures/cmd-discovery/agy-project/.gemini/skills/explain
```

- [ ] **Step 2: Create Claude project fixture files**

`relay/test/fixtures/cmd-discovery/claude-project/.claude/commands/review.md`:
```markdown
---
description: Review the current branch
argument-hint: <branch>
---

Review the diff…
```

`relay/test/fixtures/cmd-discovery/claude-project/.claude/commands/git/commit.md`:
```markdown
---
description: Commit staged changes
---

Commit them.
```

`relay/test/fixtures/cmd-discovery/claude-project/.claude/skills/summarize/SKILL.md`:
```markdown
---
description: Summarize the working tree
---

Summarize.
```

- [ ] **Step 3: Create Antigravity project fixture files**

`relay/test/fixtures/cmd-discovery/agy-project/.gemini/commands/test.toml`:
```toml
description = "Run the test suite"
argument-hint = "[--watch]"
prompt = "ignored"
```

`relay/test/fixtures/cmd-discovery/agy-project/.gemini/commands/git/commit.toml`:
```toml
description = "Commit via git"
prompt = "ignored"
```

`relay/test/fixtures/cmd-discovery/agy-project/.gemini/skills/explain/SKILL.md`:
```markdown
---
description: Explain a piece of code
---
body
```

- [ ] **Step 4: Verify fixtures created**

Run:
```bash
find relay/test/fixtures/cmd-discovery -type f | sort
```
Expected output lists 6 files.

- [ ] **Step 5: Commit**

```bash
git add relay/test/fixtures/
git commit -m "test(relay): add fixtures for command-discovery"
```

---

## Task 5: File-based discovery — implementation

**Files:**
- Create: `relay/src/commands/sources/files.js`
- Test: `relay/test/sources-files.test.js`

- [ ] **Step 1: Write the failing tests**

Create `relay/test/sources-files.test.js`:

```javascript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix relay`
Expected: FAIL with "Cannot find module '../src/commands/sources/files'".

- [ ] **Step 3: Create the files source module**

Create `relay/src/commands/sources/files.js`:

```javascript
const fs = require('node:fs').promises;
const path = require('node:path');
const { parseMarkdown, parseToml } = require('../parsers');
const logger = require('../../logger');

async function readDirSafe(dir) {
  try {
    return await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') return null;
    throw err;
  }
}

// Walk a directory recursively, returning a flat list of { absPath, namespaceSegments }
async function walkFiles(rootDir, ext, segments = []) {
  const entries = await readDirSafe(rootDir);
  if (!entries) return [];
  const out = [];
  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nested = await walkFiles(full, ext, [...segments, entry.name]);
      out.push(...nested);
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      const baseName = entry.name.slice(0, -ext.length);
      out.push({ absPath: full, namespaceSegments: segments, baseName });
    }
  }
  return out;
}

// Walk a skills root: each subdirectory with SKILL.md is one command
async function walkSkillDir(rootDir) {
  const entries = await readDirSafe(rootDir);
  if (!entries) return [];
  const out = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const skillPath = path.join(rootDir, entry.name, 'SKILL.md');
    try {
      await fs.access(skillPath);
      out.push({ absPath: skillPath, namespaceSegments: [], baseName: entry.name });
    } catch {
      // No SKILL.md in this directory — skip
    }
  }
  return out;
}

function buildCommand({ absPath, namespaceSegments, baseName }, { source, sourceLabel, isSkill }, parsed) {
  const namespace = namespaceSegments.length ? namespaceSegments.join(':') : null;
  const name = namespace ? `${namespace}:${baseName}` : baseName;
  return {
    name,
    namespace,
    source,
    sourceLabel: sourceLabel || null,
    description: parsed.description || '',
    argumentHint: parsed.argumentHint || null,
    isSkill: isSkill === true,
  };
}

async function discoverFileCommands({ roots }) {
  const results = [];
  for (const root of roots) {
    const { dir, ext, skillDir, source, sourceLabel } = root;
    try {
      const fileEntries = skillDir
        ? await walkSkillDir(dir)
        : await walkFiles(dir, ext);
      for (const fe of fileEntries) {
        let content;
        try {
          content = await fs.readFile(fe.absPath, 'utf-8');
        } catch (err) {
          logger.warn({ err: err.message, absPath: fe.absPath }, 'Failed to read command file');
          continue;
        }
        const parsed = skillDir || fe.absPath.endsWith('.md')
          ? parseMarkdown(content)
          : parseToml(content);
        results.push(buildCommand(fe, { source, sourceLabel, isSkill: !!skillDir }, parsed));
      }
    } catch (err) {
      logger.warn({ err: err.message, dir }, 'Failed to walk command directory');
    }
  }
  return results;
}

module.exports = { discoverFileCommands };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix relay`
Expected: 5 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add relay/src/commands/sources/files.js relay/test/sources-files.test.js
git commit -m "feat(relay): add filesystem-based command discovery"
```

---

## Task 6: Plugin discovery via `claude plugin list --json`

**Files:**
- Create: `relay/src/commands/sources/plugins.js`
- Test: `relay/test/sources-plugins.test.js`

- [ ] **Step 1: Write the failing tests**

Create `relay/test/sources-plugins.test.js`:

```javascript
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
  // Use the fixture directory as the installPath; we'll set up a synthetic plugin layout below
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
  // Cleanup
  await fs.rm(pluginPath, { recursive: true });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix relay`
Expected: FAIL with "Cannot find module '../src/commands/sources/plugins'".

- [ ] **Step 3: Create the plugins source module**

Create `relay/src/commands/sources/plugins.js`:

```javascript
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

    // Strip plugin's own ":<cmd>" namespace generated by subdirs; use plugin name as namespace instead
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix relay`
Expected: 5 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add relay/src/commands/sources/plugins.js relay/test/sources-plugins.test.js
git commit -m "feat(relay): discover claude plugin commands via plugin list --json"
```

---

## Task 7: Discovery orchestrator

**Files:**
- Create: `relay/src/commands/discovery.js`
- Test: `relay/test/discovery.test.js`

- [ ] **Step 1: Write the failing tests**

Create `relay/test/discovery.test.js`:

```javascript
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
  // Should still get builtin commands
  assert.ok(cmds.some(c => c.source === 'builtin'));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --prefix relay`
Expected: FAIL with "Cannot find module '../src/commands/discovery'".

- [ ] **Step 3: Create the orchestrator**

Create `relay/src/commands/discovery.js`:

```javascript
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
  // Extension roots: walk ~/.gemini/extensions/*
  const fs = require('node:fs').promises;
  const extDir = path.join(homeDir, '.gemini/extensions');
  let extRoots = [];
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

async function discoverCommands({ cwd, cliType, homeDir = os.homedir(), execAsync }) {
  let all = [];
  if (cliType === 'claude') {
    all = await discoverClaude({ cwd, homeDir, execAsync });
  } else if (cliType === 'antigravity') {
    all = await discoverAntigravity({ cwd, homeDir });
  } else {
    return [];
  }
  return sortAndGroup(all);
}

module.exports = { discoverCommands };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix relay`
Expected: 5 new tests pass; all earlier tests still pass.

- [ ] **Step 5: Commit**

```bash
git add relay/src/commands/discovery.js relay/test/discovery.test.js
git commit -m "feat(relay): orchestrate command discovery across all sources"
```

---

## Task 8: Replace the `/api/commands` route to use new discovery

**Files:**
- Modify: `relay/src/routes/commands.js`

- [ ] **Step 1: Read the current route**

Run: `cat relay/src/routes/commands.js`
Expected: shows the existing implementation that we replace.

- [ ] **Step 2: Replace the list handler**

Overwrite `relay/src/routes/commands.js` with:

```javascript
const express = require('express');
const fs = require('node:fs').promises;
const path = require('node:path');
const logger = require('../logger');
const ptyRegistry = require('../pty-registry');
const { discoverCommands } = require('../commands/discovery');

const router = express.Router();

function getInstance(instanceId) {
  if (instanceId) {
    if (!ptyRegistry.has(instanceId)) return null;
    return ptyRegistry.get(instanceId);
  }
  return ptyRegistry.getDefault();
}

function isValidCommandName(name) {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

router.get('/', async (req, res) => {
  const startTime = Date.now();
  const instanceId = req.query.instanceId;
  const instance = getInstance(instanceId);

  if (!instance || !instance.currentWorkingDir) {
    logger.info({ instanceId, elapsed: Date.now() - startTime }, 'No working directory; returning empty command list');
    return res.json({ commands: [] });
  }

  const cliType = instance.cliType || 'claude';
  const cwd = instance.currentWorkingDir;
  logger.info({ instanceId, cliType, cwd }, 'Discovering commands');

  try {
    const commands = await discoverCommands({ cwd, cliType });
    logger.info({
      instanceId, cliType, total: commands.length,
      elapsed: Date.now() - startTime,
    }, 'Returning commands');
    res.json({ commands });
  } catch (err) {
    logger.error({ err: err.message }, 'Discovery failed');
    res.status(500).json({ error: 'Failed to list commands' });
  }
});

// (Existing per-command read endpoint preserved for now — used by future arg expansion)
router.get('/:name', async (req, res) => {
  try {
    const { name } = req.params;
    if (!isValidCommandName(name)) return res.status(400).json({ error: 'Invalid command name' });
    const instanceId = req.query.instanceId;
    const instance = getInstance(instanceId);
    if (!instance || !instance.currentWorkingDir) {
      return res.status(404).json({ error: 'Instance not found or not initialized' });
    }
    const filePath = path.join(instance.currentWorkingDir, '.claude', 'commands', `${name}.md`);
    const content = await fs.readFile(filePath, 'utf-8');
    res.json({ name, content });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'Command not found' });
    logger.error({ err: err.message }, 'Failed to read command');
    res.status(500).json({ error: 'Failed to read command' });
  }
});

module.exports = router;
```

- [ ] **Step 3: Lint the relay**

Run: `npm run lint --prefix relay`
Expected: no errors.

- [ ] **Step 4: Smoke-test the endpoint locally**

Start relay in another terminal: `npm run dev --prefix relay`

In your shell:
```bash
curl -s 'http://localhost:4501/api/commands?instanceId=default' | head -c 500
```
Expected: JSON with a `commands` array. (No instance has been started, so the list may be empty `{commands:[]}` — that's correct.)

Stop the relay (Ctrl+C).

- [ ] **Step 5: Commit**

```bash
git add relay/src/routes/commands.js
git commit -m "feat(relay): wire /api/commands to new discovery pipeline"
```

---

## Task 9: App — `useCommands` hook

**Files:**
- Create: `app/src/hooks/useCommands.js`

- [ ] **Step 1: Create the hook**

Create `app/src/hooks/useCommands.js`:

```javascript
import { useState, useEffect, useCallback } from 'react';
import { commandsApi } from '../api/relay-api';
import { storage } from '../utils/storage';

const getCacheKey = (cliType, instanceId) =>
  `repo-cmds:${cliType || 'claude'}${instanceId ? `:${instanceId}` : ''}`;

function getCached(cliType, instanceId) {
  return storage.getJSON(getCacheKey(cliType, instanceId), []);
}

function setCached(commands, cliType, instanceId) {
  try {
    storage.setJSON(getCacheKey(cliType, instanceId), commands);
  } catch {
    // Ignore quota errors
  }
}

async function fetchWithRetry(instanceId, retries = 1) {
  try {
    return await commandsApi.list(instanceId);
  } catch (err) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 2000));
      return fetchWithRetry(instanceId, retries - 1);
    }
    throw err;
  }
}

export function useCommands(instanceId, cliType, { enabled = true } = {}) {
  const [commands, setCommands] = useState(() => getCached(cliType, instanceId));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchWithRetry(instanceId);
      const fresh = response.data.commands || [];
      setCommands(fresh);
      setCached(fresh, cliType, instanceId);
    } catch (err) {
      setError('Unable to load commands');
      // eslint-disable-next-line no-console
      console.error('useCommands fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [instanceId, cliType]);

  useEffect(() => {
    if (!enabled) return;
    setCommands(getCached(cliType, instanceId));
    refresh();
  }, [enabled, instanceId, cliType, refresh]);

  return { commands, loading, error, refresh };
}
```

- [ ] **Step 2: Lint the app**

Run: `npm run lint --prefix app`
Expected: no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add app/src/hooks/useCommands.js
git commit -m "feat(app): add useCommands hook for slash command data"
```

---

## Task 10: App — rebuild CommandPalette using the hook

**Files:**
- Modify: `app/src/components/command/CommandPalette.jsx`
- Delete: `app/src/constants/system-commands.js`

- [ ] **Step 1: Delete the legacy hardcoded constants file**

```bash
rm app/src/constants/system-commands.js
```

- [ ] **Step 2: Replace CommandPalette.jsx**

Overwrite `app/src/components/command/CommandPalette.jsx`:

```jsx
import { useState, useCallback, useMemo } from 'react';
import { X, Search, Terminal } from 'lucide-react';
import { useCommands } from '../../hooks/useCommands';

const SOURCE_HEADINGS = {
  project: 'Project',
  user: 'User',
  plugin: 'Plugins',
  extension: 'Extensions',
  builtin: 'Built-in',
};

function badgeText(cmd) {
  if (cmd.source === 'plugin' || cmd.source === 'extension') {
    return cmd.sourceLabel ? `${cmd.source}: ${cmd.sourceLabel}` : cmd.source;
  }
  return cmd.source;
}

function CommandPalette({ isOpen, onClose, onSelect, activeInstanceId, cliType }) {
  const [search, setSearch] = useState('');
  const { commands, loading, error } = useCommands(activeInstanceId, cliType, { enabled: isOpen });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.description && c.description.toLowerCase().includes(q))
    );
  }, [commands, search]);

  const grouped = useMemo(() => {
    const out = { project: [], user: [], plugin: [], extension: [], builtin: [] };
    for (const c of filtered) {
      if (out[c.source]) out[c.source].push(c);
    }
    return out;
  }, [filtered]);

  const handleSelect = useCallback((command) => {
    onSelect(command);
    setSearch('');
  }, [onSelect]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const hasNoResults = filtered.length === 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50"
      onClick={onClose}
      onKeyDown={handleKeyDown}
    >
      <div
        className="w-full max-w-lg bg-gray-800 rounded-t-2xl max-h-[70vh] flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-700">
          <div className="flex items-center gap-1.5">
            <span className="text-base font-bold text-purple-400">/</span>
            <h2 className="text-sm font-semibold text-white">Commands</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-gray-700">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search commands..."
              className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {hasNoResults && !loading ? (
            <div className="text-center py-8 text-gray-400">
              {search ? 'No commands found' : (error || 'No commands available')}
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(grouped).map(([source, list]) => (
                list.length > 0 && (
                  <div key={source}>
                    <h3 className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {SOURCE_HEADINGS[source]}
                    </h3>
                    <div className="space-y-1 mt-1">
                      {list.map((command) => (
                        <button
                          key={`${source}-${command.name}`}
                          onClick={() => handleSelect(command)}
                          className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-700 transition-colors text-left"
                        >
                          <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-gray-600/30 rounded-lg">
                            <Terminal className="w-3.5 h-3.5 text-gray-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-white font-medium">/{command.name}</p>
                              {command.argumentHint && (
                                <span className="text-xs text-gray-500">{command.argumentHint}</span>
                              )}
                              <span className="ml-auto text-[10px] text-gray-500 px-1.5 py-0.5 bg-gray-700 rounded">
                                {badgeText(command)}
                              </span>
                            </div>
                            {command.description && (
                              <p className="text-sm text-gray-400 truncate">{command.description}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              ))}
              {loading && (
                <div className="flex items-center justify-center py-2">
                  <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
```

- [ ] **Step 3: Lint**

Run: `npm run lint --prefix app`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/command/CommandPalette.jsx app/src/constants/system-commands.js
git commit -m "refactor(app): rebuild CommandPalette around useCommands hook + source badges"
```

---

## Task 11: Pass `cliType` from Terminal.jsx to CommandPalette

**Files:**
- Modify: `app/src/pages/Terminal.jsx`

- [ ] **Step 1: Locate the CommandPalette usage in Terminal.jsx**

Run: `grep -n "CommandPalette\|activeInstance" app/src/pages/Terminal.jsx | head -20`
Expected: shows the line where `<CommandPalette>` is rendered (around line 243) and where the active instance object is resolved.

- [ ] **Step 2: Find how cliType is sourced**

Look at `app/src/contexts/InstanceContext.jsx` — each instance object has a `cliType` field. Identify where Terminal.jsx pulls the active instance.

Run: `grep -n "instances\|activeInstanceId\|cliType" app/src/pages/Terminal.jsx | head -30`

- [ ] **Step 3: Add cliType prop**

In `app/src/pages/Terminal.jsx`, find the destructuring of the active instance (or `useInstance()`-style access) and ensure `cliType` is available. Update the `<CommandPalette>` JSX from:

```jsx
<CommandPalette
  isOpen={showCommands}
  onClose={() => setShowCommands(false)}
  onSelect={handleCommandSelect}
  activeInstanceId={activeInstanceId}
/>
```

to:

```jsx
<CommandPalette
  isOpen={showCommands}
  onClose={() => setShowCommands(false)}
  onSelect={handleCommandSelect}
  activeInstanceId={activeInstanceId}
  cliType={activeInstance?.cliType || 'claude'}
/>
```

If `activeInstance` is not already in scope, derive it. Example (add near where `activeInstanceId` is used):

```jsx
const activeInstance = instances?.find((i) => i.id === activeInstanceId);
```

- [ ] **Step 4: Lint**

Run: `npm run lint --prefix app`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/pages/Terminal.jsx
git commit -m "feat(app): pass cliType to CommandPalette so list matches active CLI"
```

---

## Task 12: CommandAutocomplete component

**Files:**
- Create: `app/src/components/input/CommandAutocomplete.jsx`

- [ ] **Step 1: Create the component**

Create `app/src/components/input/CommandAutocomplete.jsx`:

```jsx
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { useCommands } from '../../hooks/useCommands';

// Find the slash token under the caret. Returns { start, query } or null.
function findSlashToken(value, caret) {
  // Walk left from caret to find a '/' at start-of-line / after whitespace
  let i = caret - 1;
  while (i >= 0) {
    const ch = value[i];
    if (ch === '/') {
      const prev = i > 0 ? value[i - 1] : '\n';
      if (prev === '\n' || prev === ' ' || prev === '\t' || i === 0) {
        // Make sure no whitespace between '/' and caret
        const tail = value.slice(i + 1, caret);
        if (/\s/.test(tail)) return null;
        return { start: i, query: tail };
      }
      return null;
    }
    if (ch === '\n' || ch === ' ' || ch === '\t') return null;
    i--;
  }
  return null;
}

export default function CommandAutocomplete({
  value,
  caret,
  activeInstanceId,
  cliType,
  onInsert,
  disabled = false,
}) {
  const token = useMemo(() => (disabled ? null : findSlashToken(value, caret)), [value, caret, disabled]);
  const isOpen = token !== null;

  const { commands } = useCommands(activeInstanceId, cliType, { enabled: isOpen });
  const [highlight, setHighlight] = useState(0);
  const listRef = useRef(null);

  const filtered = useMemo(() => {
    if (!isOpen) return [];
    const q = token.query.toLowerCase();
    if (!q) return commands.slice(0, 50);
    return commands.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 50);
  }, [isOpen, token, commands]);

  useEffect(() => { setHighlight(0); }, [token?.query]);

  const insert = useCallback((cmd) => {
    if (!token) return;
    const before = value.slice(0, token.start);
    const after = value.slice(caret);
    onInsert({
      newValue: `${before}/${cmd.name} ${after}`,
      newCaret: token.start + cmd.name.length + 2, // '/' + name + ' '
    });
  }, [token, value, caret, onInsert]);

  // Listen for keys on document while open so arrow keys navigate even while textarea has focus
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => Math.min(h + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => Math.max(h - 1, 0));
      } else if (e.key === 'Enter') {
        if (filtered[highlight]) {
          e.preventDefault();
          insert(filtered[highlight]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        // Best-effort dismiss: clear by inserting current value untouched is no-op; rely on onInsert no-op
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [isOpen, filtered, highlight, insert]);

  if (!isOpen || filtered.length === 0) return null;

  return (
    <div className="px-3 pb-1">
      <div
        ref={listRef}
        className="bg-gray-800 border border-gray-700 rounded-lg shadow-lg max-h-60 overflow-y-auto divide-y divide-gray-700"
      >
        {filtered.map((cmd, idx) => (
          <button
            key={`${cmd.source}-${cmd.name}`}
            onClick={() => insert(cmd)}
            onMouseEnter={() => setHighlight(idx)}
            className={
              'w-full text-left flex items-center gap-2 px-3 py-1.5 text-sm ' +
              (idx === highlight ? 'bg-gray-700' : 'hover:bg-gray-700/60')
            }
          >
            <span className="text-white">/{cmd.name}</span>
            {cmd.argumentHint && <span className="text-xs text-gray-500">{cmd.argumentHint}</span>}
            <span className="ml-2 text-gray-400 text-xs truncate flex-1">{cmd.description}</span>
            <span className="text-[10px] text-gray-500 px-1.5 py-0.5 bg-gray-700/80 rounded">
              {cmd.source === 'plugin' || cmd.source === 'extension'
                ? `${cmd.source}: ${cmd.sourceLabel || ''}`
                : cmd.source}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Lint**

Run: `npm run lint --prefix app`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/input/CommandAutocomplete.jsx
git commit -m "feat(app): add inline / autocomplete component"
```

---

## Task 13: Wire InputBar to expose value + caret

**Files:**
- Modify: `app/src/components/input/InputBar.jsx`

- [ ] **Step 1: Add value + caret reporting**

Update `app/src/components/input/InputBar.jsx`. Change the props to accept optional `onStateChange`:

```jsx
const InputBar = forwardRef(function InputBar({ onSend, onStateChange, disabled = false, placeholder = 'Type a message...' }, ref) {
```

Inside `handleInput`, after `setValue(e.target.value)`, call:

```jsx
const newValue = e.target.value;
setValue(newValue);
onStateChange?.({ value: newValue, caret: e.target.selectionStart });
// Auto-resize textarea (existing code below)
```

Also report on caret moves (keyup/click/select). Add a single handler:

```jsx
const reportCaret = useCallback(() => {
  if (textareaRef.current) {
    onStateChange?.({ value, caret: textareaRef.current.selectionStart });
  }
}, [value, onStateChange]);
```

Attach it to the textarea: `onSelect={reportCaret}` and `onClick={reportCaret}`.

Expose a controlled setter via the imperativeHandle so the autocomplete can rewrite the value + caret:

```jsx
useImperativeHandle(ref, () => ({
  insertText: (text) => {
    setValue(prev => {
      const needsSpace = prev.length > 0 && !prev.endsWith(' ') && !prev.endsWith('\n');
      return prev + (needsSpace ? ' ' : '') + text;
    });
  },
  focus: () => textareaRef.current?.focus(),
  clear: () => setValue(''),
  getValue: () => value,
  setValueAndCaret: ({ newValue, newCaret }) => {
    setValue(newValue);
    // Defer caret update until after React renders the new value
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = newCaret;
        textareaRef.current.selectionEnd = newCaret;
        textareaRef.current.focus();
      }
    });
  },
}), [value]);
```

- [ ] **Step 2: Lint**

Run: `npm run lint --prefix app`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/input/InputBar.jsx
git commit -m "feat(app): expose value + caret + setValueAndCaret from InputBar"
```

---

## Task 14: Compose CommandAutocomplete in Terminal.jsx

**Files:**
- Modify: `app/src/pages/Terminal.jsx`

- [ ] **Step 1: Add state for input value + caret**

Near other `useState` calls in Terminal.jsx, add:

```jsx
const [inputState, setInputState] = useState({ value: '', caret: 0 });
```

- [ ] **Step 2: Wire the InputBar's onStateChange**

Find the existing `<InputBar ... />` JSX and add:

```jsx
<InputBar
  ref={inputBarRef}
  onSend={handleSend}
  onStateChange={setInputState}
  disabled={connectionState !== 'connected'}
  placeholder={connectionState === 'connected' ? 'Type a message...' : 'Connecting...'}
/>
```

- [ ] **Step 3: Render the autocomplete just above the InputBar**

Just before the `<InputBar ... />`:

```jsx
<CommandAutocomplete
  value={inputState.value}
  caret={inputState.caret}
  activeInstanceId={activeInstanceId}
  cliType={activeInstance?.cliType || 'claude'}
  onInsert={({ newValue, newCaret }) => {
    inputBarRef.current?.setValueAndCaret({ newValue, newCaret });
    setInputState({ value: newValue, caret: newCaret });
  }}
  disabled={connectionState !== 'connected'}
/>
```

- [ ] **Step 4: Add the import**

Near the top of `Terminal.jsx`:

```jsx
import CommandAutocomplete from '../components/input/CommandAutocomplete';
```

- [ ] **Step 5: Lint**

Run: `npm run lint --prefix app`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add app/src/pages/Terminal.jsx
git commit -m "feat(app): compose CommandAutocomplete with InputBar in Terminal page"
```

---

## Task 15: Manual verification

- [ ] **Step 1: Run the full dev stack**

Run: `npm run dev:local` (from repo root)
Expected: app on `http://localhost:4500`, relay on `http://localhost:4501`.

- [ ] **Step 2: Verify CommandPalette with a Claude instance**

In the app:
1. Add a Claude instance pointing at this repo's directory (which has `.claude/commands/`).
2. Open the bottom-sheet CommandPalette (the `/` button).
3. Confirm sections appear: **Project** (this repo's commands like `/release`, `/deploy`), **User** (likely empty), **Plugins** (lists `code-simplifier:code-simplifier`, `superpowers:brainstorming`, etc. if Claude plugins installed), **Built-in** (~91 entries: `/help`, `/clear`, `/compact`, …).
4. Each row shows: command name, optional argument hint, description, and source badge on the right.

- [ ] **Step 3: Verify inline autocomplete**

1. Tap the InputBar to focus it.
2. Type `/`. The dropdown should appear above the InputBar with all commands.
3. Type `/rel`. List should filter to `/release` and any other matches.
4. Type a space after the slash token. Dropdown should close.
5. Type `/` again, then arrow-down a few times. Highlight should move.
6. Press Enter on a highlighted item. The textarea should now contain `/release ` with the caret after the trailing space.
7. Type `URL: /foo/bar` from a clean state — dropdown should NOT open (slash is mid-token, not command-position).

- [ ] **Step 4: Verify Antigravity instance**

1. Add a second instance with `cliType: 'antigravity'` pointing at any directory.
2. Switch to it. Open the palette.
3. Expect the **Built-in** section to show agy-style commands (`/goal`, `/grill-me`, `/schedule`, `/browser`, `/help`, `/model`, …) — not the Claude built-ins.
4. If there are any `~/.gemini/extensions/*` on the relay host, an **Extensions** section should appear.

- [ ] **Step 5: Verify stale-cache behavior**

1. With the palette closed, stop the relay.
2. Open the palette. Cached commands should still render (no spinner indefinitely, eventually `Unable to load commands` error message under the spinner).
3. Restart the relay. Close + re-open the palette. Fresh fetch succeeds.

- [ ] **Step 6: Commit any small fixes discovered during testing**

If you needed to tweak anything during manual testing, commit those changes now with `fix:` or `chore:` prefixes.

---

## Self-review

**Spec coverage:**
- ✅ Server-side discovery for all source classes (Tasks 2–8)
- ✅ Claude built-in JSON (Task 3)
- ✅ Antigravity built-in JSON (Task 3)
- ✅ Plugin enumeration via `claude plugin list --json` (Task 6)
- ✅ Antigravity extensions via `~/.gemini/extensions/*` (Task 7)
- ✅ `useCommands` hook (Task 9)
- ✅ CommandPalette refactor with source badges + argument hints (Task 10)
- ✅ Pass `cliType` from Terminal.jsx (Task 11)
- ✅ Inline `/` autocomplete with activation rules from spec (Tasks 12–14)
- ✅ Manual test matrix (Task 15)
- ✅ Cache key updated to include `cliType` (Task 9 — `getCacheKey`)

**Placeholder scan:** clean.

**Type / signature consistency:** `discoverFileCommands({ roots: [...] })` shape matches between Task 5 definition and Tasks 6/7 callers. `useCommands(instanceId, cliType, { enabled })` matches between Tasks 9, 10, 12. `setValueAndCaret({ newValue, newCaret })` matches between Tasks 12 (caller) and 13 (definition).

---

## Plan complete. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using `executing-plans`, batch with checkpoints.

**Which approach?**
