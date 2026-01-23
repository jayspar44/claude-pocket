# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.2.1](https://github.com/jayspar44/claude-pocket/compare/v0.2.0...v0.2.1) (2026-01-23)


### Features

* add auto-restart on crash with diagnostics ([6f23a70](https://github.com/jayspar44/claude-pocket/commit/6f23a70a754cee775f4ac34acfb44097cfff9a21))
* add dual-relay support (DEV/PROD) and prod management skills ([8660878](https://github.com/jayspar44/claude-pocket/commit/86608786c3693a6a59bf14b0ef9e4fba3609ec68))
* recover UI updates (two-row commands, slash command fixes, mobile alignment) ([ca804e0](https://github.com/jayspar44/claude-pocket/commit/ca804e0b0674a88e061987156cc33ec26821b8bb))


### Bug Fixes

* add ~/.local/bin to PATH in PM2 config for native claude ([f521f9e](https://github.com/jayspar44/claude-pocket/commit/f521f9e941d2eeb949eb334df98d75678e23bbb4))
* correct double-escaped escape sequences in QuickActions ([1418563](https://github.com/jayspar44/claude-pocket/commit/1418563b06ce6aa7c9cbf80d7c197adced6b60eb))
* improve numbered option detection with idle state tracking ([3c55f4b](https://github.com/jayspar44/claude-pocket/commit/3c55f4b500aef718be17303abad6f7cf05359bb4))
* pass ptyStatus to StatusBar to show Claude running indicator ([d498d2d](https://github.com/jayspar44/claude-pocket/commit/d498d2df1e15ad670da1188dd02607a00990b680))

## 0.1.0 (Initial Release)

### Features

* Initial boilerplate template
* React 19 + Vite 7 + Tailwind CSS 4 frontend
* Express 5 backend with Firebase integration
* Capacitor mobile support
* Claude Code slash commands
* Conventional commits with auto-versioning
* Cloud Build CI/CD configuration
* PR preview environments
