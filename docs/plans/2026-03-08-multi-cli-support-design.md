# Multi-CLI Support: Claude + Gemini

## Summary

Add per-instance CLI selection (Claude or Gemini) with a default setting, remove broken option detection, and update the header to reflect the active CLI.

## Changes

### Relay — Config & PTY

- Add `geminiCommand` to `config.js` (env var `GEMINI_COMMAND`, default `gemini`)
- `pty-manager.js`: Accept `cliType` param (`claude` | `gemini`), spawn corresponding command
- Remove option detection logic from `pty-manager.js`
- Remove `options-detected` WebSocket message type from `websocket-handler.js`
- `set-instance` message gains `cliType` field; passed through to PTY manager on spawn

### Relay — Instance Persistence

- Instance records store `cliType` alongside `workingDir`
- `/api/instances` endpoints include `cliType` in request/response

### App — Instance Management

- `InstanceContext.jsx`: Add `cliType` field to instance objects (default from settings)
- `InstanceManager.jsx`: Add CLI type picker (Claude/Gemini) when creating/editing an instance
- Remove `detectedOptions`, `needsInput` state tracking
- Remove `options-detected` message handling

### App — UI

- Page header: Switch between "Claude" and "Gemini" based on active instance's `cliType`
- Remove any option detection button UI

### App — Settings

- Add "Default CLI" dropdown (Claude / Gemini) to Settings page
- Persist in localStorage alongside other settings

### App — Relay API

- Update `relay-api.js` to pass `cliType` in instance create/start calls

## Out of Scope

- No Gemini-specific option detection or prompt parsing
- No CLI update commands for Gemini
- No CLI-specific theming or icons
- No changes to terminal, WebSocket transport, or buffering
