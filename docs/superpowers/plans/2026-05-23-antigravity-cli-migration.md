# Antigravity CLI Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Gemini CLI integration with Antigravity CLI (binary `agy`) before the 2026-06-18 Gemini deprecation deadline.

**Architecture:** The `develop` branch already has multi-CLI plumbing (`cliType` field on instances, binary selection in PtyManager, per-instance picker). This plan swaps every `gemini`/`Gemini` reference for `antigravity`/`Antigravity`, adds a one-line backward-compat shim for stored instances, and documents the manual minibox install + OAuth bootstrap.

**Tech Stack:** Node 22 + Express 5 (relay), React 19 + Vite 7 (app), node-pty for process spawn, system keychain for `agy` OAuth tokens.

**Spec:** `docs/superpowers/specs/2026-05-23-antigravity-cli-migration-design.md`

**Spec deviation:** The spec specified `SETUP.md` for install/auth docs, but that file is stale template boilerplate (Firebase/GCP, unrelated to Claude Pocket). This plan puts the docs in `CLAUDE.md` instead.

**Testing strategy:** No app/relay unit test infrastructure currently exists for this surface area. Verification is manual smoke testing on the DEV minibox environment after Task 4 deploys.

---

## Task 1: Update relay code (config + PtyManager + JSDoc + .env.example)

All four relay-side changes are tightly coupled (config rename must match PtyManager usage) — one task, one commit.

**Files:**
- Modify: `relay/src/config.js:53`
- Modify: `relay/src/pty-manager.js:66-68` and `relay/src/pty-manager.js:106`
- Modify: `relay/src/pty-registry.js:26`
- Modify: `relay/.env.example:11-12`

- [ ] **Step 1: Edit `relay/src/config.js`**

Replace line 53:

```js
  geminiCommand: process.env.GEMINI_COMMAND || 'gemini',
```

with:

```js
  antigravityCommand: process.env.ANTIGRAVITY_COMMAND || 'agy',
```

- [ ] **Step 2: Edit `relay/src/pty-manager.js` — `cliLabel` getter**

Replace lines 66-68:

```js
  get cliLabel() {
    return this.cliType === 'gemini' ? 'Gemini CLI' : 'Claude Code';
  }
```

with:

```js
  get cliLabel() {
    return this.cliType === 'antigravity' ? 'Antigravity CLI' : 'Claude Code';
  }
```

- [ ] **Step 3: Edit `relay/src/pty-manager.js` — binary selection**

Replace line 106:

```js
      const command = this.cliType === 'gemini' ? config.geminiCommand : config.claudeCommand;
```

with:

```js
      const command = this.cliType === 'antigravity' ? config.antigravityCommand : config.claudeCommand;
```

- [ ] **Step 4: Edit `relay/src/pty-registry.js` — JSDoc**

Replace line 26:

```js
   * @param {string} cliType - CLI type ('claude' or 'gemini'), defaults to 'claude'
```

with:

```js
   * @param {string} cliType - CLI type ('claude' or 'antigravity'), defaults to 'claude'
```

- [ ] **Step 5: Edit `relay/.env.example` — env var rename**

Replace lines 11-12:

```
# Gemini CLI command (if not in PATH)
GEMINI_COMMAND=gemini
```

with:

```
# Antigravity CLI command (if not in PATH)
ANTIGRAVITY_COMMAND=agy
```

- [ ] **Step 6: Verify relay starts without error**

Run:
```bash
cd ~/Documents/projects/claude-pocket-dev && npm run lint
```
Expected: `npm run lint` exits 0. (Local relay restart will happen during deploy in Task 5.)

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/projects/claude-pocket-dev
git add relay/src/config.js relay/src/pty-manager.js relay/src/pty-registry.js relay/.env.example
git commit -m "$(cat <<'EOF'
refactor: swap Gemini CLI for Antigravity CLI in relay

- Rename geminiCommand -> antigravityCommand (default binary: agy)
- Rename GEMINI_COMMAND -> ANTIGRAVITY_COMMAND env var
- Update cliLabel and binary selection to check 'antigravity'

Part of Gemini CLI deprecation migration (deadline 2026-06-18).
EOF
)"
```

---

## Task 2: Update app code (4 files: rename + migration shim)

All four app-side changes are coupled (cliType value must match across context, status bar, and pickers) — one task, one commit.

**Files:**
- Modify: `app/src/contexts/InstanceContext.jsx:297`
- Modify: `app/src/components/StatusBar.jsx:95`
- Modify: `app/src/components/instance/InstanceManager.jsx:288` and `:448,459`
- Modify: `app/src/pages/Settings.jsx:400,410`

- [ ] **Step 1: Edit `app/src/contexts/InstanceContext.jsx` — add migration shim**

Replace line 297:

```jsx
          cliType: instance.cliType || 'claude',
```

with:

```jsx
          cliType: (instance.cliType === 'gemini' ? 'antigravity' : instance.cliType) || 'claude',
```

- [ ] **Step 2: Edit `app/src/components/StatusBar.jsx` — label**

Replace line 95:

```jsx
                <span className="text-xs text-gray-400 leading-4">{isPtyRunning ? (cliType === 'gemini' ? 'Gemini' : 'Claude') : 'Stopped'}</span>
```

with:

```jsx
                <span className="text-xs text-gray-400 leading-4">{isPtyRunning ? (cliType === 'antigravity' ? 'Antigravity' : 'Claude') : 'Stopped'}</span>
```

- [ ] **Step 3: Edit `app/src/components/instance/InstanceManager.jsx` — instance list label**

Replace line 288:

```jsx
                          {(instance.cliType || 'claude') === 'gemini' ? 'Gemini' : 'Claude'}
```

with:

```jsx
                          {(instance.cliType || 'claude') === 'antigravity' ? 'Antigravity' : 'Claude'}
```

- [ ] **Step 4: Edit `app/src/components/instance/InstanceManager.jsx` — picker**

Replace lines 448 and 459 in the picker block:

```jsx
                  {['claude', 'gemini'].map((cli) => (
```

with:

```jsx
                  {['claude', 'antigravity'].map((cli) => (
```

And in the same block, replace:

```jsx
                      {cli === 'claude' ? 'Claude' : 'Gemini'}
```

with:

```jsx
                      {cli === 'claude' ? 'Claude' : 'Antigravity'}
```

- [ ] **Step 5: Edit `app/src/pages/Settings.jsx` — default-CLI picker**

Replace line 400:

```jsx
              {['claude', 'gemini'].map((cli) => (
```

with:

```jsx
              {['claude', 'antigravity'].map((cli) => (
```

And replace line 410:

```jsx
                  {cli === 'claude' ? 'Claude' : 'Gemini'}
```

with:

```jsx
                  {cli === 'claude' ? 'Claude' : 'Antigravity'}
```

- [ ] **Step 6: Verify lint passes**

Run:
```bash
cd ~/Documents/projects/claude-pocket-dev && npm run lint
```
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
cd ~/Documents/projects/claude-pocket-dev
git add app/src/contexts/InstanceContext.jsx app/src/components/StatusBar.jsx app/src/components/instance/InstanceManager.jsx app/src/pages/Settings.jsx
git commit -m "$(cat <<'EOF'
refactor: swap Gemini for Antigravity in app UI

- Picker options and display labels: gemini -> antigravity
- StatusBar label: Gemini -> Antigravity
- InstanceContext: migrate stored cliType 'gemini' -> 'antigravity' on load

Part of Gemini CLI deprecation migration (deadline 2026-06-18).
EOF
)"
```

---

## Task 3: Document Antigravity install + auth in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (add a new "CLI Prerequisites" section after the "Architecture" section)

- [ ] **Step 1: Locate insertion point in `CLAUDE.md`**

Open `CLAUDE.md`. Find the "## Architecture" section. The new section goes immediately after it, before "## Project Structure".

- [ ] **Step 2: Insert new section**

Insert this block between the Architecture and Project Structure sections:

```markdown
## CLI Prerequisites

The relay spawns either `claude` or `agy` (Antigravity CLI) per instance. Both must be installed and authenticated on the host before instances of that CLI type will work.

**Claude Code:** Install via official installer; ensure `claude` is on `PATH`.

**Antigravity CLI** (replaces Gemini CLI, deprecated 2026-06-18):

```bash
# Install on minibox (one-time)
curl -fsSL https://antigravity.google/cli/install.sh | bash
agy --version    # verify

# First-time auth (one-time, interactive)
ssh minibox
agy              # prints authorization URL
# Open URL in a browser, complete Google Sign-In
# Token is saved to macOS keychain under the jayspar user
# PROD and DEV folders share this auth (same user)
```

If `agy` is missing or unauthenticated, the PTY surfaces the error in the terminal view — same behavior as Claude CLI errors.
```

- [ ] **Step 3: Commit**

```bash
cd ~/Documents/projects/claude-pocket-dev
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: add Antigravity CLI install + auth prerequisites

Document the one-time agy install and OAuth bootstrap on minibox,
shared across PROD and DEV folders.
EOF
)"
```

---

## Task 4: Install + auth `agy` on minibox (manual, one-time)

This is a manual operational task — no code changes. **Must complete before Task 5** so the DEV smoke test has a working `agy` binary.

**Prerequisites:** SSH access to minibox; ability to open a browser to complete Google Sign-In.

- [ ] **Step 1: Confirm execution context**

Run:
```bash
hostname
```
Expected: `MiniBox.local` (if not, SSH into minibox first: `ssh minibox`).

- [ ] **Step 2: Install `agy`**

Run on minibox:
```bash
curl -fsSL https://antigravity.google/cli/install.sh | bash
```
Expected: install script completes without error.

- [ ] **Step 3: Verify install**

Run:
```bash
agy --version
which agy
```
Expected: version string prints; `which` returns a non-empty path.

- [ ] **Step 4: Complete first-time auth**

Run on minibox in an interactive shell:
```bash
agy
```
Expected: `agy` prints an authorization URL. Copy it into a browser on your phone or laptop, complete Google Sign-In. After auth completes, exit `agy` (`/quit` or Ctrl+D).

- [ ] **Step 5: Verify auth persisted**

Run:
```bash
agy
```
Expected: launches without re-asking for auth. Exit.

---

## Task 5: Deploy to DEV and smoke test

**Prerequisites:** Tasks 1–4 complete. Working directory clean (or only the pre-existing lock-file diffs).

- [ ] **Step 1: Push develop**

```bash
cd ~/Documents/projects/claude-pocket-dev
git push origin develop
```
Expected: push succeeds.

- [ ] **Step 2: Deploy to DEV**

If on minibox:
```bash
cd ~/Documents/projects/claude-pocket-dev && ./scripts/deploy.sh
```
If on local Mac:
```bash
ssh minibox "cd ~/Documents/projects/claude-pocket-dev && git pull && ./scripts/deploy.sh"
```
Expected: deploy completes; both `claude-pocket-app-dev` and `claude-pocket-relay-dev` show `online` in PM2 with the new code (uptime resets).

- [ ] **Step 3: Health check**

```bash
curl -s -o /dev/null -w "Relay: %{http_code}\nApp: %{http_code}\n" \
  http://minibox.rattlesnake-mimosa.ts.net:4503/api/health \
  http://minibox.rattlesnake-mimosa.ts.net:4502
```
Expected: both `200`.

- [ ] **Step 4: Smoke test — Antigravity instance spawns `agy`**

In a browser, open `http://minibox.rattlesnake-mimosa.ts.net:4502`. Create a new instance via the Instance Manager with **CLI = Antigravity**. Send it any prompt (e.g., `hello`).

Expected: terminal renders the `agy` TUI; agy responds.

Verify on minibox:
```bash
pm2 logs claude-pocket-relay-dev --lines 20 --nostream | grep -i "Antigravity\|agy"
```
Expected: log line `Starting Antigravity CLI process` appears.

- [ ] **Step 5: Smoke test — status bar shows "Antigravity"**

In the same instance, confirm the status bar (bottom of terminal view) displays "Antigravity" while the PTY is running.

- [ ] **Step 6: Smoke test — migration shim**

In the browser DevTools console:
```js
// Read current instances
const stored = JSON.parse(localStorage.getItem('instances'));
console.log(stored);
// Pick an instance and force cliType to 'gemini' to simulate pre-migration state
stored[0].cliType = 'gemini';
localStorage.setItem('instances', JSON.stringify(stored));
location.reload();
```
After reload, open Instance Manager. Expected: the instance shows "Antigravity" (not "Gemini"), confirming the shim mapped it on load.

- [ ] **Step 7: Smoke test — Claude regression**

Create another instance with **CLI = Claude**. Send a prompt. Expected: Claude responds normally. Status bar shows "Claude".

- [ ] **Step 8: If any smoke test fails**

Stop. Diagnose. Fix in a new commit on `develop`. Re-deploy (Step 2) and re-test from the failed step.

---

## Task 6: PR, merge, release, deploy PROD

**Prerequisites:** Task 5 smoke tests all pass on DEV.

- [ ] **Step 1: Open PR**

From local Mac (or wherever `gh` is authed):
```bash
gh pr create --base main --head develop --title "feat: migrate Gemini CLI to Antigravity CLI" --body "$(cat <<'EOF'
## Summary
- Replace Gemini CLI integration with Antigravity CLI (binary: `agy`) ahead of the 2026-06-18 Gemini deprecation deadline
- Reuses the existing multi-CLI architecture; no architectural changes
- Adds a one-line migration shim mapping stored `cliType: 'gemini'` -> `'antigravity'` for any dev/test instances

## Test plan
- [x] DEV smoke test: new Antigravity instance spawns `agy` and responds
- [x] DEV smoke test: status bar shows "Antigravity"
- [x] DEV smoke test: migration shim converts a pre-existing `cliType: 'gemini'` instance
- [x] DEV smoke test: Claude instance regression check passes
- [ ] PROD: deploy after merge, then create a fresh Antigravity instance and verify it works

## Prerequisite
`agy` must be installed and authenticated on minibox (one-time manual bootstrap — see CLAUDE.md "CLI Prerequisites"). Already completed on minibox for DEV testing.

## Refs
- Design spec: `docs/superpowers/specs/2026-05-23-antigravity-cli-migration-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-23-antigravity-cli-migration.md`
EOF
)"
```
Expected: PR URL returned.

- [ ] **Step 2: Code review**

Trigger `/code-review` or `/ultrareview` on the PR. Address any findings.

- [ ] **Step 3: Merge**

Once approved:
```bash
/pr-merge <PR#>
```
Expected: PR merged to `main`, `develop` rebased/synced.

- [ ] **Step 4: Release (PATCH bump)**

```bash
/release --patch
```
Expected: version bumped to next patch (e.g., `0.5.4` → `0.5.5`), tag pushed.

- [ ] **Step 5: Deploy to PROD**

```bash
/deploy --env prod
```
Expected: PROD app + relay restart on the new version, both report `online`.

- [ ] **Step 6: PROD verification**

Open `http://minibox.rattlesnake-mimosa.ts.net:4500`. Create a new instance with CLI = Antigravity. Send a prompt. Expected: `agy` responds; status bar shows "Antigravity".

Also verify Claude still works (create or use an existing Claude instance, send a prompt).

- [ ] **Step 7: Done**

Migration complete. Gemini CLI references are gone; Antigravity is live on PROD before the 2026-06-18 deadline.

---

## Self-Review Notes

- **Spec coverage:** All 9 files in the spec inventory are covered (Tasks 1+2+3). Migration shim covered in Task 2 Step 1. Install/auth in Task 4. Testing in Task 5. Rollout in Task 6.
- **Spec deviation flagged:** SETUP.md → CLAUDE.md (documented at top of plan).
- **No placeholders:** All steps have exact code or exact commands.
- **Type/naming consistency:** `cliType === 'antigravity'`, `antigravityCommand`, `ANTIGRAVITY_COMMAND`, `'Antigravity CLI'`, `'Antigravity'` used consistently across tasks.
