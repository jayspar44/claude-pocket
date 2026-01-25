# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.3.1](https://github.com/jayspar44/claude-pocket/compare/v0.3.0...v0.3.1) (2026-01-25)


### Bug Fixes

* settings page safe area bottom on Android ([f7a9589](https://github.com/jayspar44/claude-pocket/commit/f7a95894f8dc328bef64421b388d126c782ca42b))

## [0.3.0](https://github.com/jayspar44/claude-pocket/compare/v0.2.2...v0.3.0) (2026-01-25)


### Features

* add environment suffix to Android app names ([c1b1414](https://github.com/jayspar44/claude-pocket/commit/c1b1414ac6997e0ea3d9a3aed57db349fa184616))
* add notification diagnostics and debug logging ([dae87cd](https://github.com/jayspar44/claude-pocket/commit/dae87cd3b0be79df68644a244b2fedd45a76cd03))
* add pwa notifications and auto-detect local/remote execution ([e102c2f](https://github.com/jayspar44/claude-pocket/commit/e102c2fbac71dc6e5d2be5b8189fe9b624ef3882))
* add stop all instances button to settings ([7c3643f](https://github.com/jayspar44/claude-pocket/commit/7c3643fe5971dc48ce5d029d7469695dd53cad1a))
* add test notification button in settings ([76b5d52](https://github.com/jayspar44/claude-pocket/commit/76b5d52aefb85f9743ade41ad1d0b01c507e8cd5))
* allow PTY control for all instances in instance manager ([5453161](https://github.com/jayspar44/claude-pocket/commit/54531617dcf8fceb341dd3625955fdd4c74fe0ee))
* complete multi-pty support and statusbar improvements ([170230c](https://github.com/jayspar44/claude-pocket/commit/170230ca0df49f8fd702563b09c467cb4bba6b59))
* consolidate instance manager UX with auto-open and empty state ([2041dbf](https://github.com/jayspar44/claude-pocket/commit/2041dbf9ffa505d5f6bbb86c9b0229da687d75b2))
* merge multi-pty updates and statusbar improvements ([64420f1](https://github.com/jayspar44/claude-pocket/commit/64420f1613da365ba639659cf6cbf754de08711c))
* options detection improvements and config fixes ([8419650](https://github.com/jayspar44/claude-pocket/commit/8419650b28ea61fd8acc6b667d5850fb53a77e17))


### Bug Fixes

* auto clear and replay terminal when switching instances ([fbd63c2](https://github.com/jayspar44/claude-pocket/commit/fbd63c2fea279f3d6e95f6219b57341eadc2f8b2))
* instance manager modal safe area and spacing ([a5332f1](https://github.com/jayspar44/claude-pocket/commit/a5332f1064208402ee00a85c29c8908b324cd5e8))
* instance manager UX issues ([d5504d9](https://github.com/jayspar44/claude-pocket/commit/d5504d9a506e0f766d664871404fd08631de7726))
* prevent duplicate terminal output in multi-instance mode ([e1c26a5](https://github.com/jayspar44/claude-pocket/commit/e1c26a55dde173fd5ba4bc4dde06f155ea1ea3bc))
* prevent duplicate WebSocket connections ([8cd6a07](https://github.com/jayspar44/claude-pocket/commit/8cd6a0766058e3f626c125fdf9f2d7d33ab1ecba))
* re-subscribe terminal listener when switching instances ([0e10f9f](https://github.com/jayspar44/claude-pocket/commit/0e10f9fda1d4a4351b86993c03b9085be9c09949))
* reduce false positives in numbered options detection ([f837657](https://github.com/jayspar44/claude-pocket/commit/f837657044922334ba3966d1de4843ea01044824))
* resolve relay eslint config issues ([30fbb9e](https://github.com/jayspar44/claude-pocket/commit/30fbb9ef5e640c46aeb0c855d7c35ce41662e85f))
* robust multi-instance terminal message routing ([c45f3b5](https://github.com/jayspar44/claude-pocket/commit/c45f3b56b61c7f504468597532e7398e7eb052a1))
* settings safe areas and relay version display ([8269f9b](https://github.com/jayspar44/claude-pocket/commit/8269f9b4be34aaa13826f6c0316044d1f6cb4531))

### [0.2.2](https://github.com/jayspar44/claude-pocket/compare/v0.2.1...v0.2.2) (2026-01-24)


### Features

* full DEV/PROD environment separation ([fa7796a](https://github.com/jayspar44/claude-pocket/commit/fa7796a40e499680fce5a3a9aa0bb2f324e10cb3))
* separate deploy scripts for PROD and DEV ([6b155eb](https://github.com/jayspar44/claude-pocket/commit/6b155eb81ef06a0fd827ac84625aad7f634e7c88))


### Bug Fixes

* add node-pty spawn-helper permission fix to deploy script ([aa12698](https://github.com/jayspar44/claude-pocket/commit/aa12698672434e1a1253be692dcd1865af3413a4))

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
