# Antigravity CLI Migration — Design Spec

**Date:** 2026-05-23
**Status:** Approved — ready for implementation plan
**Author:** Brainstormed with Claude

## Context

Google announced the deprecation of Gemini CLI on 2026-05-19. After 2026-06-18, Gemini CLI will stop serving requests for Google AI Pro, Ultra, and free Code Assist users. Antigravity CLI (binary: `agy`) is the official replacement — a Go-based, agent-first TUI sharing the same harness as Antigravity 2.0.

Claude Pocket added multi-CLI support on the `develop` branch (~17 commits, not yet released to PROD). That work introduced a `cliType` field on instances and a binary-selection layer in the relay's PtyManager, with Claude and Gemini as the two supported CLIs. Because the Gemini integration never shipped to PROD, this migration has no production user data to preserve — only ephemeral dev/test instances.

## Goal

Replace all Gemini CLI integration in Claude Pocket with Antigravity CLI, leveraging the existing multi-CLI architecture. Ship before 2026-06-18.

## Non-goals

- Adding Antigravity as a *third* CLI alongside Gemini — we are replacing, not extending.
- Preserving access to Gemini CLI for paid Gemini Code Assist Standard/Enterprise users — out of scope for this app's user base.
- Restructuring the multi-CLI plumbing — the existing architecture is adequate.
- Auto-installing `agy` via the deploy script — bootstrap is one-time and manual.

## Naming

| Layer | Old | New |
|-------|-----|-----|
| Internal `cliType` value | `'gemini'` | `'antigravity'` |
| Display label | `Gemini` | `Antigravity` |
| Binary (default) | `gemini` | `agy` |
| Env var | `GEMINI_COMMAND` | `ANTIGRAVITY_COMMAND` |
| Config field | `geminiCommand` | `antigravityCommand` |
| `cliName()` return value | `Gemini CLI` | `Antigravity CLI` |

## Backward compatibility

The `cliType: 'gemini'` value may exist in localStorage on dev/test devices. `InstanceContext.jsx` will silently map `'gemini'` → `'antigravity'` on instance load. No user-visible warning. The shim is one line and can be removed in a later release after dev devices have re-loaded.

## Code change inventory

**Relay (3 files):**

| File | Change |
|------|--------|
| `relay/src/config.js` | Rename `geminiCommand` → `antigravityCommand`. Env var `GEMINI_COMMAND` → `ANTIGRAVITY_COMMAND`. Default `'gemini'` → `'agy'`. |
| `relay/src/pty-manager.js` | `cliName()`: return `'Antigravity CLI'` instead of `'Gemini CLI'`. Binary selection check: `cliType === 'gemini'` → `cliType === 'antigravity'`. Read `config.antigravityCommand`. |
| `relay/src/pty-registry.js` | JSDoc comment: `'claude' or 'gemini'` → `'claude' or 'antigravity'`. |

**App (4 files):**

| File | Change |
|------|--------|
| `app/src/contexts/InstanceContext.jsx` | Add migration shim around line 297: `cliType: (instance.cliType === 'gemini' ? 'antigravity' : instance.cliType) \|\| 'claude'`. |
| `app/src/components/StatusBar.jsx` | Display label `'Gemini'` → `'Antigravity'`; check value `=== 'antigravity'`. |
| `app/src/components/instance/InstanceManager.jsx` | Picker array `['claude', 'gemini']` → `['claude', 'antigravity']`; display label conditional updated. |
| `app/src/pages/Settings.jsx` | Same picker swap as InstanceManager. |

**Config / docs (2 files):**

| File | Change |
|------|--------|
| `relay/.env.example` | Comment update + var rename. |
| `SETUP.md` | New section: Antigravity install + first-time auth. |

**Untouched:** `docs/plans/2026-03-08-multi-cli-support*.md` — historical plan artifacts. Leave as-is.

**Total: 9 files. All single-line or single-block edits. No architectural changes.**

## Minibox install & auth

The `agy` binary must be installed and authenticated on the minibox host before any Antigravity instance can spawn.

**Install (one-time, manual, on minibox):**

```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
agy --version    # verify
```

**Auth (one-time, manual, on minibox):**

Antigravity CLI uses the system keyring with Google Sign-In fallback. On a headless / SSH session it prints an authorization URL instead of auto-opening a browser.

1. SSH into minibox.
2. Run `agy` interactively.
3. Copy the printed authorization URL into a browser on a personal device.
4. Complete Google Sign-In.
5. `agy` stores the OAuth token in the macOS keychain under the `jayspar` user.

PROD and DEV folders both run as `jayspar` and share the same keychain entry — one install + auth covers both environments.

**Failure mode:** If `agy` is missing or unauthenticated, the PTY surfaces the error directly in the terminal view — same behavior as today's Claude/Gemini CLI errors. No special in-app handling.

**Deploy script:** No changes. Optional future enhancement: deploy-time warning if `agy` is not on `PATH` and any instance has `cliType: 'antigravity'`. Skipping per YAGNI.

## Testing

On minibox DEV (after install + auth):

1. Create a new instance with `cliType: 'antigravity'` via the UI; verify the PTY spawns `agy`.
2. Verify the status bar shows "Antigravity".
3. Pre-load a stored instance with `cliType: 'gemini'` (manually edit localStorage); verify it loads as Antigravity via the migration shim.
4. Smoke test a Claude instance — regression check that the multi-CLI plumbing still works.

## Rollout

1. Single PR off `develop`.
2. Code review + merge to `main`.
3. `/release` — PATCH bump. No breaking change for end users (Gemini was never on PROD).
4. Install + auth `agy` on minibox (PROD prerequisite).
5. `/deploy --env prod`.
6. Verify a fresh Antigravity instance works on PROD.

**Deadline:** 2026-06-18 (Gemini CLI deprecation). ~25 days of headroom from today.

## References

- [Google Developers Blog — Transitioning Gemini CLI to Antigravity CLI](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/)
- [Antigravity CLI repository](https://github.com/google-antigravity/antigravity-cli)
- [Antigravity CLI Deep Dive (agentpedia)](https://agentpedia.codes/blog/antigravity-cli-deep-dive)
- Internal: `docs/plans/2026-03-08-multi-cli-support-design.md` (original multi-CLI design)
