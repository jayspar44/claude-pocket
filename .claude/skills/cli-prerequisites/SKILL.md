---
name: cli-prerequisites
description: Install and authenticate the CLIs the relay spawns (claude, agy/Antigravity, codex). Use when a PTY reports a missing or unauthenticated CLI, when setting up a new host, or when overriding CLI binary paths.
---

# CLI Prerequisites

The relay spawns one of `claude` (Claude Code), `agy` (Antigravity CLI), or `codex` (OpenAI Codex) per instance. Each must be installed and authenticated on the host before instances of that CLI type will work.

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

**OpenAI Codex CLI:**

```bash
# Install on minibox (one-time) — pick one:
npm install -g @openai/codex
# or
curl -fsSL https://chatgpt.com/codex/install.sh | sh
# or
brew install --cask codex
codex --version    # verify

# First-time auth (one-time, interactive)
ssh minibox
codex login        # opens a browser flow; choose "Sign in with ChatGPT"
# Sign in with ChatGPT Plus/Pro/Business/Edu/Enterprise account
# (API-key auth is also supported via OPENAI_API_KEY for non-ChatGPT users)
# Credentials saved under ~/.codex/ for the jayspar user
# PROD and DEV folders share this auth (same user)

# Manual update (the relay also runs this automatically before spawn)
codex update
```

If any CLI is missing or unauthenticated, the PTY surfaces the error in the terminal view.

**Override binary paths** (optional, in `relay/.env`): `CLAUDE_COMMAND`, `ANTIGRAVITY_COMMAND`, `CODEX_COMMAND`.
