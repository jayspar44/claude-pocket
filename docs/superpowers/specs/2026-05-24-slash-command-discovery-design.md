# Slash Command Discovery — Design

**Date:** 2026-05-24
**Status:** Approved, ready for implementation plan

## Goal

Make slash command discovery in the mobile app **dynamic and CLI-aware**:

1. Surface commands from all relevant sources on disk (project, user, plugins/extensions) rather than only `<cwd>/.claude/commands/`.
2. Show CLI built-in commands (e.g. `/help`, `/clear`, `/goal`) without requiring manual maintenance per release.
3. Work for both Claude (`claude`) and Antigravity (`agy`) instances, with the active tab's CLI type determining which set is shown.
4. Add an inline `/` typeahead in the InputBar in addition to the existing bottom-sheet CommandPalette.

## Non-goals

- Executing the command's behavior inside the app (commands are inserted into the terminal session as text; the CLI handles execution).
- Multi-CLI fan-out (each instance has one active CLI; switching instances changes the active set).
- Live HTML-parse of upstream documentation in v1. (Deferred to v2; see *Future work*.)
- Hot-reload of file changes during palette open. (Each open re-fetches; no filesystem watcher needed.)

## Sources

### Claude (`cliType: 'claude'`)

| Class | Source paths |
|---|---|
| Project | `<cwd>/.claude/commands/**/*.md` · `<cwd>/.claude/skills/*/SKILL.md` |
| User | `~/.claude/commands/**/*.md` · `~/.claude/skills/*/SKILL.md` |
| Plugin | For each plugin returned by `claude plugin list --json`: `<installPath>/commands/**/*.md` · `<installPath>/skills/*/SKILL.md` |
| Built-in | `relay/src/commands/builtins/claude.json` |

### Antigravity (`cliType: 'antigravity'`)

| Class | Source paths |
|---|---|
| Project | `<cwd>/.gemini/commands/**/*.toml` · `<cwd>/.gemini/skills/*/SKILL.md` |
| User | `~/.gemini/commands/**/*.toml` · `~/.gemini/antigravity/skills/*/SKILL.md` · `~/.agents/skills/*/SKILL.md` |
| Extension | `~/.gemini/extensions/*/commands/**/*.toml` · `~/.gemini/extensions/*/skills/*/SKILL.md` |
| Built-in | `relay/src/commands/builtins/antigravity.json` |

### Naming conventions

- Subdirectories in command roots become namespaced commands: `commands/git/commit.toml` → `git:commit`.
- Plugin/extension commands and skills are namespaced as `<plugin-or-ext-name>:<command-name>` to disambiguate.
- SKILL.md files: the **directory name** is the command name (per Agent Skills standard).

### Built-in fallback data

Initial data scraped (this conversation, 2026-05-24):

- `relay/src/commands/builtins/claude.json` — **91 commands** parsed from `https://code.claude.com/docs/en/commands`. 9 are tagged `isSkill: true` (bundled skills like `/batch`, `/code-review`, `/debug`).
- `relay/src/commands/builtins/antigravity.json` — **42 commands**: 38 inherited from Gemini CLI (`geminicli.com/docs/reference/commands/`) + 4 agy-specific (`/goal`, `/grill-me`, `/schedule`, `/browser`).

Each row: `{ name, description, argumentHint }` plus optional metadata:
- Claude entries: `isSkill: boolean`
- Antigravity entries: `lineage: 'gemini-cli-shared' | 'antigravity-specific'` (renamed from `source` in the scrape to avoid conflicting with the API-level `source` field below; this metadata is internal — not surfaced in responses, kept only for future maintainer reference)

These files are seeded by the scrape captured at `docs/superpowers/specs/2026-05-24-slash-command-discovery/` and copied into `relay/src/commands/builtins/` during implementation. When loaded, every row gets `source: 'builtin'` injected before being returned by the API.

## Architecture

### Server (relay)

```
relay/src/
└── commands/
    ├── discovery.js              # orchestrator: discoverCommands({ cwd, cliType })
    ├── sources/
    │   ├── files.js              # walks command/skill directories
    │   ├── plugins.js            # shells out to `claude plugin list --json`, walks installPaths
    │   └── builtin.js            # reads builtins/<cliType>.json
    ├── parsers.js                # markdown frontmatter + minimal TOML extractor
    └── builtins/
        ├── claude.json
        └── antigravity.json
```

`relay/src/routes/commands.js` is reduced to a thin handler that:
1. Resolves `instanceId` → `{ cwd, cliType }` from `pty-registry`.
2. Returns `{ commands: [] }` if the instance isn't initialized.
3. Otherwise calls `discoverCommands({ cwd, cliType })` and returns the merged list.

### Discovery flow

`discoverCommands({ cwd, cliType })` returns a flat array. Order of sources is preserved in the array so the client can group by `source` without re-sorting:

1. Project files (priority highest — local to repo)
2. User files
3. Plugin (Claude) / Extension (agy)
4. Built-in

Inside a source class, results are sorted alphabetically by `name`.

### Response shape

```js
{
  commands: [
    {
      name: 'review',                  // canonical command name without leading slash
      namespace: null,                  // or 'git' for namespaced commands
      source: 'project',                // 'project'|'user'|'plugin'|'extension'|'builtin'
      sourceLabel: null,                // 'superpowers' for plugin/extension provenance
      description: '...',
      argumentHint: '<branch>',         // or null
      isSkill: false                    // true for SKILL.md-style entries and bundled skills
    }
  ]
}
```

### Parsing details

**Markdown frontmatter** (existing pattern, extracted from `routes/commands.js`):
- Extract `description` and `argument-hint` (new) from `---`-delimited YAML
- Fallback: first `# Heading` becomes description if no frontmatter

**TOML** (Gemini/agy custom commands):
- Hand-rolled extractor; only reads two keys: `description = "..."` and `argument-hint = "..."` (or `argumentHint`)
- No third-party TOML library — keeps relay dep tree small
- Multi-line `prompt = """..."""` values are ignored (we don't need them for the palette)

**SKILL.md** (Agent Skills standard): identical to Claude project commands — markdown with YAML frontmatter. Same parser, with the directory name supplying the command name.

### Caching

| Source | Cache | Reason |
|---|---|---|
| File-based (project/user/extension) | None | `fs.readdir` is fast; the user expects edits to appear immediately |
| Claude plugin list | In-memory, 60s, keyed by `(cliType, plugin-list-hash)` | Shelling out to `claude plugin list --json` takes ~100ms; 60s absorbs burst requests during palette open |
| Built-in JSON | Loaded once at relay boot | Static |

## Client

### New hook: `useCommands(instanceId, cliType)`

`app/src/hooks/useCommands.js` — single source of truth for command data. Consumed by both `CommandPalette` and `CommandAutocomplete`.

- Per-(instanceId, cliType) localStorage cache. Cache key: `repo-cmds:<cliType>:<instanceId>`.
- Returns `{ commands, loading, error, refresh }`.
- Same fetch-with-one-retry behavior as today.
- Stale cache is shown immediately on open; fresh fetch replaces it when ready.

### CommandPalette changes

- Accept `cliType` prop from `Terminal.jsx` (already in instance state).
- Drop the hardcoded `SYSTEM_COMMANDS` import — built-ins now come from the server.
- Group rendering by `source`: **Project → User → Plugin/Extension → Built-in**, each as a labeled section.
- Each row displays:
  - Command name (with namespace prefix if present, e.g. `/git:commit`)
  - Argument hint after name in dim text (e.g. `/review <branch>`)
  - Description on the second line
  - Small badge tag for the source (`project`, `user`, `plugin: superpowers`, `extension: code-review`, `builtin`)
- Search filters across name + description (existing behavior).

### Inline autocomplete

New component `app/src/components/input/CommandAutocomplete.jsx`, anchored above the InputBar:

**Activation rules:**
- Open when the caret is in a token starting with `/` that is at position 0 or follows whitespace/newline.
- Close on any of: space typed after the `/<token>`, Esc, blur, send, caret leaves the `/` token.
- Don't open mid-prompt for slashes that aren't command-position (e.g. `URL: /foo/bar`).

**UX:**
- Floating panel above textarea, max height ~40vh, scrollable.
- Compact single-line rows: `/<name> <arg-hint>  — description (source-badge)`.
- Tap or Enter inserts `/<name> ` (with trailing space) at the matched token position.
- Arrow keys navigate within the dropdown without leaving the textarea (key events from textarea forward to autocomplete when open).

**InputBar changes (minimal):**
- Already controlled. Add caret-position + value change callbacks consumed by the autocomplete sibling.
- No internal refactor; the autocomplete is composed in `Terminal.jsx` next to the existing InputBar.

## Testing

- **Unit tests** (`relay/test/`):
  - `parsers.test.js` — markdown frontmatter, TOML extraction, namespace flattening of subdirs.
  - `discovery.test.js` — runs against fixture directories under `relay/test/fixtures/cmd-discovery/{claude,agy}/`. Fixtures cover: project only, user only, plugin only, all combined, empty, malformed frontmatter.
- **Manual test matrix:**
  - Claude instance with: only project, only user, only plugin, all three.
  - Agy instance with: only project (.toml), user TOML, extension SKILL.md, all combined.
  - Switching instances mid-session — palette content swaps to the new instance's CLI built-ins.
  - Network errors / relay restart — stale cache shown, retry works.

## Rollout

- No data migration. Cache key changes from `repo-cmds-<id>` to `repo-cmds:<cliType>:<id>`. Old keys orphan and never resurface.
- No API version bump needed — `/api/commands` adds fields (`source`, `argumentHint`, `namespace`, `sourceLabel`, `isSkill`). Existing client code reading `name` + `description` continues to work, but will be updated in the same PR.

## Future work (v2)

- **Live docs refresh.** Background job in the relay that fetches `code.claude.com/docs/en/commands` (and any parseable agy source) daily, re-parses, and overwrites the in-memory built-in list. Static JSON remains as the safety net for parse failures.
- **Inline argument completion.** After inserting `/review`, surface the `argumentHint` as a placeholder in the input. Out of scope for v1.
- **Hot reload.** Filesystem watcher (e.g. `chokidar`) on the command directories so palette stays fresh without re-fetch. Likely not worth the cost given file walks are cheap.

## Open questions

None — all decisions made in brainstorming on 2026-05-24:
- File-based v static built-ins ratio: built-ins are static for v1; everything else discovered live.
- HTML scrape: deferred to v2; v1 ships the one-off scraped JSON as fallback.
- Built-ins file location: `relay/src/commands/builtins/*.json`.
- Inline autocomplete behavior: opens on `/` at start-of-line or after whitespace; closes on space after the token.
- Metadata shown: source badge + argument hint (both confirmed).
