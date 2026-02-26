# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.5.3](https://github.com/jayspar44/claude-pocket/compare/v0.5.0...v0.5.3) (2026-02-26)


### Features

* add ExitBroadcastReceiver for notification exit action ([ac00699](https://github.com/jayspar44/claude-pocket/commit/ac0069988c079c1da85a7d257a5c6957ecdb4c18))
* auto-update Claude Code before every PTY start ([d738271](https://github.com/jayspar44/claude-pocket/commit/d73827115651c140675b4ba4996edce8a5f1bfec))
* tab-aware command list + fixes ([54b1905](https://github.com/jayspar44/claude-pocket/commit/54b19053aa6e3869ca65741484178e7f41e0485e))
* tab-aware command list + multiple fixes ([#3](https://github.com/jayspar44/claude-pocket/issues/3)) ([e70d894](https://github.com/jayspar44/claude-pocket/commit/e70d894821282f31866784747c57668b162e67a8))


### Bug Fixes

* add path traversal protection and null checks in commands API ([ca02395](https://github.com/jayspar44/claude-pocket/commit/ca02395639040a4ca45a4872725dd55d8cfe9b5d))
* defer PTY start to first resize and unify keyboard state management ([d1eee07](https://github.com/jayspar44/claude-pocket/commit/d1eee07357cf9d9a42da69e43620ee0ea8a94fdc))
* make file upload API instance-aware ([27af74e](https://github.com/jayspar44/claude-pocket/commit/27af74e0616bf5861491249abb0819636c720364))
* preserve terminal dimensions across resize and restart ([c3b4488](https://github.com/jayspar44/claude-pocket/commit/c3b448887ec21aa95d574cb31622a10db0decf44))
* reset keyboard state on app load to fix stale viewport ([7fea5f7](https://github.com/jayspar44/claude-pocket/commit/7fea5f71b42d72f76420898ce75047141eab1a30))
* resolve blank screen and nested Claude session crashes ([bc08adb](https://github.com/jayspar44/claude-pocket/commit/bc08adb721e026a5f423634f36098e17f1b7ca13))
* resolve ghost keyboard viewport on app resume ([0a16c7c](https://github.com/jayspar44/claude-pocket/commit/0a16c7cc63d5be87b6e72eb68b2163d9353d2ded))
* route all PTY starts through WebSocket deferred path ([2ab5c88](https://github.com/jayspar44/claude-pocket/commit/2ab5c88da4576c4f653ea8c5943f33cd5241806f))
* send terminal dimensions with set-instance to fix mobile rendering ([bfea6ed](https://github.com/jayspar44/claude-pocket/commit/bfea6ed43d3d88614df66f7cf5dfb07003a3715d))
* show keyboard on ghost detection instead of fighting stale viewport ([4fdb3ad](https://github.com/jayspar44/claude-pocket/commit/4fdb3ad9a91af30733a45d46c893f7ee5ca4081d))
* suppress viewport resize during resume to prevent ghost keyboard ([812e8a8](https://github.com/jayspar44/claude-pocket/commit/812e8a8e7c3f368ae40daad7a444babc5d8b2ead))
* switch keyboard resize from native to body mode ([6bba684](https://github.com/jayspar44/claude-pocket/commit/6bba684cd6c2a20954e321dc49d36eeeef4be805))
* use event-based ghost keyboard guard instead of time-based suppression ([502d49e](https://github.com/jayspar44/claude-pocket/commit/502d49eb9f939fb31f853edb835407fd2eb75ef1))
* use last known viewport height instead of screen.availHeight ([3066026](https://github.com/jayspar44/claude-pocket/commit/3066026b6a3e655d9994529267c3495391a044c3))

### [0.5.2](https://github.com/jayspar44/claude-pocket/compare/v0.5.1...v0.5.2) (2026-02-20)


### Bug Fixes

* defer PTY start to first resize and unify keyboard state management ([d1eee07](https://github.com/jayspar44/claude-pocket/commit/d1eee07357cf9d9a42da69e43620ee0ea8a94fdc))
* preserve terminal dimensions across resize and restart ([c3b4488](https://github.com/jayspar44/claude-pocket/commit/c3b448887ec21aa95d574cb31622a10db0decf44))
* resolve ghost keyboard viewport on app resume ([0a16c7c](https://github.com/jayspar44/claude-pocket/commit/0a16c7cc63d5be87b6e72eb68b2163d9353d2ded))
* route all PTY starts through WebSocket deferred path ([2ab5c88](https://github.com/jayspar44/claude-pocket/commit/2ab5c88da4576c4f653ea8c5943f33cd5241806f))
* show keyboard on ghost detection instead of fighting stale viewport ([4fdb3ad](https://github.com/jayspar44/claude-pocket/commit/4fdb3ad9a91af30733a45d46c893f7ee5ca4081d))
* suppress viewport resize during resume to prevent ghost keyboard ([812e8a8](https://github.com/jayspar44/claude-pocket/commit/812e8a8e7c3f368ae40daad7a444babc5d8b2ead))
* switch keyboard resize from native to body mode ([6bba684](https://github.com/jayspar44/claude-pocket/commit/6bba684cd6c2a20954e321dc49d36eeeef4be805))
* use event-based ghost keyboard guard instead of time-based suppression ([502d49e](https://github.com/jayspar44/claude-pocket/commit/502d49eb9f939fb31f853edb835407fd2eb75ef1))
* use last known viewport height instead of screen.availHeight ([3066026](https://github.com/jayspar44/claude-pocket/commit/3066026b6a3e655d9994529267c3495391a044c3))

### [0.5.1](https://github.com/jayspar44/claude-pocket/compare/v0.5.0...v0.5.1) (2026-02-20)


### Features

* add ExitBroadcastReceiver for notification exit action ([ac00699](https://github.com/jayspar44/claude-pocket/commit/ac0069988c079c1da85a7d257a5c6957ecdb4c18))
* tab-aware command list + fixes ([54b1905](https://github.com/jayspar44/claude-pocket/commit/54b19053aa6e3869ca65741484178e7f41e0485e))
* tab-aware command list + multiple fixes ([#3](https://github.com/jayspar44/claude-pocket/issues/3)) ([e70d894](https://github.com/jayspar44/claude-pocket/commit/e70d894821282f31866784747c57668b162e67a8))


### Bug Fixes

* add path traversal protection and null checks in commands API ([ca02395](https://github.com/jayspar44/claude-pocket/commit/ca02395639040a4ca45a4872725dd55d8cfe9b5d))
* send terminal dimensions with set-instance to fix mobile rendering ([bfea6ed](https://github.com/jayspar44/claude-pocket/commit/bfea6ed43d3d88614df66f7cf5dfb07003a3715d))

## [0.5.0](https://github.com/jayspar44/claude-pocket/compare/v0.4.0...v0.5.0) (2026-01-28)


### Features

* add app exit behavior, instance restore, and keyboard fix ([b672d5f](https://github.com/jayspar44/claude-pocket/commit/b672d5fe613e1e96f37c9e8f2a75bf0f0bacca2f))
* add long-press to select text in terminal ([ae31f76](https://github.com/jayspar44/claude-pocket/commit/ae31f76c062a010661806c5bd51ca23d19dafe1d))
* add tracked android resources and AAB build script ([9a39903](https://github.com/jayspar44/claude-pocket/commit/9a39903eddcbb6a83327df2fe228f27e6494693b))


### Bug Fixes

* git branch update after checkout + long-press copy in terminal ([bbd8927](https://github.com/jayspar44/claude-pocket/commit/bbd8927c74f6899dc177b602bae9c8473f7e9226))
* resolve tab indicator bugs and add processing spinner ([7e59d00](https://github.com/jayspar44/claude-pocket/commit/7e59d0034373622b6c5d1e0e531a2b9a5fb58f17))
* update build output path to claude-pocket-aabs ([c697651](https://github.com/jayspar44/claude-pocket/commit/c697651fa144199ac90ac2c55478bcfc0b67d537))

## [0.4.0](https://github.com/jayspar44/claude-pocket/compare/v0.2.3...v0.4.0) (2026-01-27)


### Features

* add Android build scripts and deploy automation ([ce941a8](https://github.com/jayspar44/claude-pocket/commit/ce941a8c717c418722eff02a1bc1802bf123a71b))
* add android foreground service to keep websocket alive ([15921e1](https://github.com/jayspar44/claude-pocket/commit/15921e1d32883f6e8fdb49d4df86a0d6b4e0f71d))
* add notification debug logging and visibility tracking ([808a858](https://github.com/jayspar44/claude-pocket/commit/808a858fd1de7f2a614f3459433510a9718477af))
* add orphaned instances section to settings page ([2ba2f68](https://github.com/jayspar44/claude-pocket/commit/2ba2f684d34b37859e6623df352974efb02dc054))
* reorganize build outputs to centralized directory ([79b2bfd](https://github.com/jayspar44/claude-pocket/commit/79b2bfdd13bbd6169b39e2305b8ce64d56420275))
* sync DEV build scripts with PROD, add instance manager improvements ([981f70a](https://github.com/jayspar44/claude-pocket/commit/981f70ab3ea2ee281aef3df15244f3e6ef7edfa3))


### Bug Fixes

* detect inline numbered options (1. Yes  2. No  3. Cancel) ([a51b8fb](https://github.com/jayspar44/claude-pocket/commit/a51b8fbdf77e638198445f338da244e05408d9af))
* notification ID must be within Java int range ([0a62290](https://github.com/jayspar44/claude-pocket/commit/0a622906cf79ce2866411d8852eed72dc3084021))
* notification title and duplicate notification issues ([7187252](https://github.com/jayspar44/claude-pocket/commit/71872529c0363cb25a8677177aaed0bd288b86e6))
* notifications trigger on app background, add needs-input tab indicator ([b7f4497](https://github.com/jayspar44/claude-pocket/commit/b7f44977927a0480dd5e35afbd525d1739a73c2e))
* settings page blank screen from orphaned instances feature ([feff652](https://github.com/jayspar44/claude-pocket/commit/feff65231e29dec0d138ecf29210d90b33b117ca))
* show all server instances with connection status in Settings ([4dfca42](https://github.com/jayspar44/claude-pocket/commit/4dfca429147584c94c4cfd70c4b34570951cf5e7))
* terminal font size default and number bar option detection ([63204ef](https://github.com/jayspar44/claude-pocket/commit/63204ef2da6619a91e8e21e28ce5804b61e6cb86))
* update viewport height when app returns from background ([e74e975](https://github.com/jayspar44/claude-pocket/commit/e74e97595f7659cc414e6a9b7ca46b3f87645f9d))
* use ref for connectionState in Settings to prevent effect re-runs ([b44c754](https://github.com/jayspar44/claude-pocket/commit/b44c754ab41c44dc7ffd450419c44fa7f6af026a))

### [0.3.1](https://github.com/jayspar44/claude-pocket/compare/v0.3.0...v0.3.1) (2026-01-25)


### Bug Fixes

* settings page safe area bottom on Android ([f7a9589](https://github.com/jayspar44/claude-pocket/commit/f7a95894f8dc328bef64421b388d126c782ca42b))

## [0.3.0](https://github.com/jayspar44/claude-pocket/compare/v0.2.2...v0.3.0) (2026-01-25)


### Features

* add environment suffix to Android app names ([c1b1414](https://github.com/jayspar44/claude-pocket/commit/c1b1414ac6997e0ea3d9a3aed57db349fa184616))
* add notification diagnostics and debug logging ([dae87cd](https://github.com/jayspar44/claude-pocket/commit/dae87cd3b0be79df68644a244b2fedd45a76cd03))
* add stop all instances button to settings ([7c3643f](https://github.com/jayspar44/claude-pocket/commit/7c3643fe5971dc48ce5d029d7469695dd53cad1a))
* add test notification button in settings ([76b5d52](https://github.com/jayspar44/claude-pocket/commit/76b5d52aefb85f9743ade41ad1d0b01c507e8cd5))
* allow PTY control for all instances in instance manager ([5453161](https://github.com/jayspar44/claude-pocket/commit/54531617dcf8fceb341dd3625955fdd4c74fe0ee))
* consolidate instance manager UX with auto-open and empty state ([2041dbf](https://github.com/jayspar44/claude-pocket/commit/2041dbf9ffa505d5f6bbb86c9b0229da687d75b2))


### Bug Fixes

* auto clear and replay terminal when switching instances ([fbd63c2](https://github.com/jayspar44/claude-pocket/commit/fbd63c2fea279f3d6e95f6219b57341eadc2f8b2))
* instance manager modal safe area and spacing ([a5332f1](https://github.com/jayspar44/claude-pocket/commit/a5332f1064208402ee00a85c29c8908b324cd5e8))
* instance manager UX issues ([d5504d9](https://github.com/jayspar44/claude-pocket/commit/d5504d9a506e0f766d664871404fd08631de7726))
* prevent duplicate terminal output in multi-instance mode ([e1c26a5](https://github.com/jayspar44/claude-pocket/commit/e1c26a55dde173fd5ba4bc4dde06f155ea1ea3bc))
* re-subscribe terminal listener when switching instances ([0e10f9f](https://github.com/jayspar44/claude-pocket/commit/0e10f9fda1d4a4351b86993c03b9085be9c09949))
* reduce false positives in numbered options detection ([f837657](https://github.com/jayspar44/claude-pocket/commit/f837657044922334ba3966d1de4843ea01044824))
* resolve relay eslint config issues ([30fbb9e](https://github.com/jayspar44/claude-pocket/commit/30fbb9ef5e640c46aeb0c855d7c35ce41662e85f))
* robust multi-instance terminal message routing ([c45f3b5](https://github.com/jayspar44/claude-pocket/commit/c45f3b56b61c7f504468597532e7398e7eb052a1))
* settings safe areas and relay version display ([8269f9b](https://github.com/jayspar44/claude-pocket/commit/8269f9b4be34aaa13826f6c0316044d1f6cb4531))

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
