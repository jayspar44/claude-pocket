# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.5.0](https://github.com/jayspar44/claude-pocket/compare/v1.4.4...v1.5.0) (2026-08-09)


### Bug Fixes

* **relay:** enforce ALLOWED_ORIGINS instead of reflecting every origin ([a4d7c4d](https://github.com/jayspar44/claude-pocket/commit/a4d7c4d3bef7dc1e67d6ebde7a236fae9623d335))
* **relay:** reset the client screen before replaying the output buffer ([13c8765](https://github.com/jayspar44/claude-pocket/commit/13c876595a8f1bf30b08abf2b073ac03b21aac0b))
* **relay:** revert CORS enforcement, complete the replay screen reset ([bf24255](https://github.com/jayspar44/claude-pocket/commit/bf2425562ff63ef86a726b3f6eca2bb82f353202))

### [1.4.4](https://github.com/jayspar44/claude-pocket/compare/v1.4.3...v1.4.4) (2026-08-08)


### Bug Fixes

* **app:** hold terminal geometry still while the keyboard is open ([f5164de](https://github.com/jayspar44/claude-pocket/commit/f5164de75f03ed04e09a9d450fde629e7332aa7f))
* **relay:** bound the output buffer by bytes instead of blank repaint rows ([77cd489](https://github.com/jayspar44/claude-pocket/commit/77cd4893b4645ce3984582ed2505daae51018f29))

### [1.4.3](https://github.com/jayspar44/claude-pocket/compare/v1.4.2...v1.4.3) (2026-08-08)


### Bug Fixes

* **app:** keep Reconnect usable, and the wrap count independent of scroll ([5df5de5](https://github.com/jayspar44/claude-pocket/commit/5df5de5d5151a2b809357aa95cad4b1fc668fefa))
* **app:** restore the reconnect budget a relay restart needs ([9cd7a3c](https://github.com/jayspar44/claude-pocket/commit/9cd7a3cf536684372a2e3e7f20268474eec53e24))
* **app:** stop a cold-radio resume probe dropping a live socket ([64bf09e](https://github.com/jayspar44/claude-pocket/commit/64bf09e0f9c23981b77400c346596db7403ddec7))
* **relay:** drain the pending output batch before snapshotting a replay ([b50b6f7](https://github.com/jayspar44/claude-pocket/commit/b50b6f7bac1fee2de1cd6836392f8670cbc3322f))
* **relay:** keep a failed set-instance from freezing the terminal ([14b98e5](https://github.com/jayspar44/claude-pocket/commit/14b98e511857e4a9acc950ad3ace6a2e491bf879))
* **relay:** stop output buffer collapsing to a single chunk ([b7f3225](https://github.com/jayspar44/claude-pocket/commit/b7f3225edb0de95c2f3f82d88608eaf2d07daf5b))
* **relay:** suppress the drained batch for the client that asked to replay ([a877599](https://github.com/jayspar44/claude-pocket/commit/a877599431f16fab5cb40802683d97da420ae52d))


### Performance

* **app:** bound the geometry walk to the viewport ([9e0d5ed](https://github.com/jayspar44/claude-pocket/commit/9e0d5ed1edf473505f042deeb9fb9e42cdfb3dd6))

### [1.4.2](https://github.com/jayspar44/claude-pocket/compare/v1.4.1...v1.4.2) (2026-08-07)


### Bug Fixes

* **relay:** make a healthy geometry report visible at least once ([f7ea55c](https://github.com/jayspar44/claude-pocket/commit/f7ea55cc5c1b1f0f4141154d7751ddf5e2d1d53d))

### [1.4.1](https://github.com/jayspar44/claude-pocket/compare/v1.4.0...v1.4.1) (2026-08-05)


### Bug Fixes

* **app:** confirm terminal dimensions right after the handshake ([a5a7255](https://github.com/jayspar44/claude-pocket/commit/a5a72554c9a151df2e507df114e71a9e92cc98c9))

## [1.4.0](https://github.com/jayspar44/claude-pocket/compare/v1.3.0...v1.4.0) (2026-08-05)


### Features

* **app:** report recovery latency to the relay on the handshake ([7aa5a1e](https://github.com/jayspar44/claude-pocket/commit/7aa5a1eb6aafa81ea02c0ca5388aaa4dd4881218))


### Bug Fixes

* **app:** catch the resume signal visibilitychange was missing ([14f389e](https://github.com/jayspar44/claude-pocket/commit/14f389e6d7ae9315a0d353661929c5f6bb1ab4ba))
* **app:** reconnect on resume instead of waiting out a connect timeout ([adc0d11](https://github.com/jayspar44/claude-pocket/commit/adc0d1101e679d5ced1a7bcf417a7ae35cc00d3a))

## [1.3.0](https://github.com/jayspar44/claude-pocket/compare/v1.2.0...v1.3.0) (2026-08-04)


### Features

* **app:** add ConnectionManager with one shared heartbeat ([46a6471](https://github.com/jayspar44/claude-pocket/commit/46a6471ff7326f89a3d13d21749e4c8768ce7f80))
* **app:** add InstanceConnection with connect and handshake ([f2bddd3](https://github.com/jayspar44/claude-pocket/commit/f2bddd38c1416ef3f89037e391172cdbf1b55340))
* **app:** align the tab limit to the relay's instance cap ([dad96c1](https://github.com/jayspar44/claude-pocket/commit/dad96c1c175bc2982f3348d7f3e6e67e30470a1d))
* **app:** reconnect on every involuntary close, with a real ladder ([b357f73](https://github.com/jayspar44/claude-pocket/commit/b357f73b74dec07bb70fa5187c7fd875b29dfc13)), closes [#8](https://github.com/jayspar44/claude-pocket/issues/8)
* **app:** record why a connection is down, plus idle and teardown ([4912c24](https://github.com/jayspar44/claude-pocket/commit/4912c24aefffb7dc0ac2cfcc99dd13a25f286063))


### Bug Fixes

* address code review findings on orphaned-WebSocket fix ([09dce64](https://github.com/jayspar44/claude-pocket/commit/09dce648cd3c2e21e7d06ee54c05f5cedf5e0e41))
* **app:** bound how long a resize burst can withhold a size ([bd224df](https://github.com/jayspar44/claude-pocket/commit/bd224dfbed90b051089810ce5ebf81613122491d))
* **app:** complete the handshake on pty-error, not pty-status alone ([bccbbff](https://github.com/jayspar44/claude-pocket/commit/bccbbff8d62428ebf067943e9af897e01be309ac))
* **app:** connect to the new relay url, not a stale one ([5caeb67](https://github.com/jayspar44/claude-pocket/commit/5caeb67e3d26a8a195eb69940dd448ece3a70e6a))
* **app:** debounce terminal resize before it reaches the PTY ([01b65cf](https://github.com/jayspar44/claude-pocket/commit/01b65cfa3690a0908facb0846426d903c3666124))
* **app:** do not reconnect a tab the relay never stopped ([6fb08b0](https://github.com/jayspar44/claude-pocket/commit/6fb08b0f4720b3e24d51023d2642fb7863a80c68))
* **app:** keep the foreground service while any connection retries ([3e6b173](https://github.com/jayspar44/claude-pocket/commit/3e6b173bb599b193afb56b0f080d3fb80eaf2ee9))
* **app:** keep the tab online after Stop so Start comes back ([922e121](https://github.com/jayspar44/claude-pocket/commit/922e121ed62fd8a9a042a62584b263e800ae195c))
* **app:** let the relay decide the instance cap instead of guessing ([ba56b3e](https://github.com/jayspar44/claude-pocket/commit/ba56b3e77a348a8eb214b2a740ac035e0fa4f801))
* **app:** let the relay's instance cap arrive after a failed fetch ([f3f1056](https://github.com/jayspar44/claude-pocket/commit/f3f1056b379f57a9441fd6cd0282404c34ddf809))
* **app:** make a stopped session survive an app resume ([cdb526b](https://github.com/jayspar44/claude-pocket/commit/cdb526b9ceca1918ea91bfde68c886eed54e0355))
* **app:** make the foreground-service flag follow intent ([3f6a2c3](https://github.com/jayspar44/claude-pocket/commit/3f6a2c3e7a4c4992a3ccfd26146c61deb8188727))
* **app:** reconnect only the tabs Stop All actually stopped ([3e8be8a](https://github.com/jayspar44/claude-pocket/commit/3e8be8a0c39c4d30c968a70386ada72638a8ee3c))
* **app:** release the foreground service on provider unmount ([24cfef5](https://github.com/jayspar44/claude-pocket/commit/24cfef566ba3b23e950a56f3c8f1b670df862142))
* **app:** require a handshake payload at construction ([d659a31](https://github.com/jayspar44/claude-pocket/commit/d659a3112dfc6e49dfad3887bbb1be4f8025c8a3))
* **app:** restore only a tab that was live before the stop ([7efb3b7](https://github.com/jayspar44/claude-pocket/commit/7efb3b7df2a03fd338db3e056e2ecb57b9d9c832))
* **app:** revive every connection on resume, not just one ([fda895a](https://github.com/jayspar44/claude-pocket/commit/fda895a54f58c61c6982afc8c35648dae383bde8))
* **app:** say that Stop All blocks tab auto-restart ([b5b510f](https://github.com/jayspar44/claude-pocket/commit/b5b510f20bb65778cfc67703c439be97554556a6))
* **app:** send Start through set-instance again ([9524a74](https://github.com/jayspar44/claude-pocket/commit/9524a7423cedab8bc920282721f23b4c5cac7930))
* **app:** start a fresh reconnect ladder on an external connect ([33fbdc6](https://github.com/jayspar44/claude-pocket/commit/33fbdc68e4c1434d73f86a2a36a0912575111bb0))
* **app:** start a stopped session via the start API ([076720b](https://github.com/jayspar44/claude-pocket/commit/076720b8b1a0f81f963cc7ade742de2fd9dbb4fd))
* **app:** stop leaving a stopped session able to respawn ([1965425](https://github.com/jayspar44/claude-pocket/commit/19654253574dd0da60c9574c99002bfbdfa332c9))
* **app:** stopping sessions no longer resurrects them ([70afa4d](https://github.com/jayspar44/claude-pocket/commit/70afa4d2e3abae67b51207496e479037573c1d6b))
* **app:** tell the user to delete a tab, not stop a session ([33f882d](https://github.com/jayspar44/claude-pocket/commit/33f882df3c8c060d9ed2876fc0da04d173e523fb))
* **app:** treat a socket with no close event as gone ([ac23117](https://github.com/jayspar44/claude-pocket/commit/ac231176833a2e76d0c6d9c7563dbc70803b22cf))
* bin the registry-level stop record, and two defects around it ([3678ad6](https://github.com/jayspar44/claude-pocket/commit/3678ad6614a2873df504bed44e1a7600d5e06801))
* correct stale update-skip comment in pty-manager ([0bbb338](https://github.com/jayspar44/claude-pocket/commit/0bbb3383ba8e2b9219e87c69d3d784c93e4d743f))
* end a refused set-instance in disconnected, not connected ([e296728](https://github.com/jayspar44/claude-pocket/commit/e296728dffac4ae1b3dd5783bc441afed138f8c4))
* prevent handshake payload from overriding type/instanceId ([c79008d](https://github.com/jayspar44/claude-pocket/commit/c79008d1a49086d7ef006dee1a95ff9d5a6fc626))
* **relay:** a failed pty.spawn() must not crash the whole relay ([601ee17](https://github.com/jayspar44/claude-pocket/commit/601ee177596868aaed7c8763592ac1855591a9f8))
* **relay:** a non-numeric MAX_INSTANCES no longer disables the cap ([5cd077a](https://github.com/jayspar44/claude-pocket/commit/5cd077ac6723368780adc5c282d40ab4a8a6f629))
* **relay:** a superseded PTY start must not spawn ([bc676bd](https://github.com/jayspar44/claude-pocket/commit/bc676bd5125495e90981627a924ed99480fcf4ad))
* **relay:** a superseded start must not reset the live attempt ([5db04a5](https://github.com/jayspar44/claude-pocket/commit/5db04a5a2725f3ebc9bc9a831814694b97f93c0b))
* **relay:** add a starting state to the PTY lifecycle ([0be9451](https://github.com/jayspar44/claude-pocket/commit/0be94512906a93e6d4b8158b65bcea7a44652af7))
* **relay:** an explicit stop disarms a pending deferred start ([fac01e1](https://github.com/jayspar44/claude-pocket/commit/fac01e1a5769f208a4022426d217bf6007424bd1))
* **relay:** an explicitly stopped session does not auto-restart ([24ed67a](https://github.com/jayspar44/claude-pocket/commit/24ed67a3c8cc8c9769ed44149914bf0ae0b99a02))
* **relay:** bound remembered user stops without expiring them ([06ce7c8](https://github.com/jayspar44/claude-pocket/commit/06ce7c82c1209d472a851a29b31f7c65ecd1b471))
* **relay:** do not evict a starting PTY manager; publish the instance cap ([9ccbb19](https://github.com/jayspar44/claude-pocket/commit/9ccbb19ee3aeabfe21c71e241027b28efecdd99a))
* **relay:** do not pass CLAUDE_CODE_CHILD_SESSION to spawned CLIs ([19928b3](https://github.com/jayspar44/claude-pocket/commit/19928b304115f0f9c05b2834baa5e5c5aff3ce5d))
* **relay:** record client dimensions from set-instance during starting ([aa4bd2d](https://github.com/jayspar44/claude-pocket/commit/aa4bd2dcfc6ec6f648900c9d8467568b5a3431c5))
* **relay:** reject non-object WebSocket frames before dispatch ([42727a6](https://github.com/jayspar44/claude-pocket/commit/42727a63463a76533dab51b96bf51cb619f0c70c))
* **relay:** release WebSockets on shutdown ([ba09a09](https://github.com/jayspar44/claude-pocket/commit/ba09a0984e6d29441c3724a5ef205687ff43b636))
* **relay:** remember an explicit stop across remove() so it survives DELETE ([4ebb62a](https://github.com/jayspar44/claude-pocket/commit/4ebb62a85222ed36519f3434453dfcb50e13ad2c))
* **relay:** say why a set-instance declined to auto-start ([a98eb44](https://github.com/jayspar44/claude-pocket/commit/a98eb441cdd41fd5cf834934b573e8c5f5b28642))
* **relay:** send the missing-working-dir error after the replay ([7c73f67](https://github.com/jayspar44/claude-pocket/commit/7c73f67f37bdd5e844901864ba2367fdcbdf2794))
* **relay:** stale geometry and a live process must not survive ([44ab4c6](https://github.com/jayspar44/claude-pocket/commit/44ab4c6ecfd4b08d7aed62951b0626b44d535cb2))
* **relay:** start routes must treat a starting PTY as busy ([aba3128](https://github.com/jayspar44/claude-pocket/commit/aba312829ca8b610303caca042b95ddd7c638dc4))
* **relay:** stop expiring the user-stop record after 30 minutes ([60c44aa](https://github.com/jayspar44/claude-pocket/commit/60c44aac761ac606582bef8b02ab1c709bec9555))
* **relay:** stop route must record the stop in the registry ([1904d4f](https://github.com/jayspar44/claude-pocket/commit/1904d4f4bc7ec01d1b99edccb4e0293ec3a23390))
* **relay:** treat a starting PTY as busy at every decision point ([8629e29](https://github.com/jayspar44/claude-pocket/commit/8629e29859031b149c64c77150d3b0004e9206bc))
* **relay:** two set-instance defects around stop and dimensions ([c6576da](https://github.com/jayspar44/claude-pocket/commit/c6576da3df90447167a34441361653029a24b1aa))
* **relay:** unref the PTY registry's idle-cleanup interval ([035ea78](https://github.com/jayspar44/claude-pocket/commit/035ea78dc39408873e232504b2fc88262739f37d))
* replace orphan-sweep heuristic with deterministic supersede ([b0b30d9](https://github.com/jayspar44/claude-pocket/commit/b0b30d91a2edea50a54c59771c17fe7414f6d5b2))
* restore five-rung reconnect ladder, fix off-by-one in test ([4bf5f49](https://github.com/jayspar44/claude-pocket/commit/4bf5f49519c59557ae9ffa6ff2c96af80a45b975))
* stop duplicated terminal output from orphaned WebSockets ([#8](https://github.com/jayspar44/claude-pocket/issues/8)) ([bd782f5](https://github.com/jayspar44/claude-pocket/commit/bd782f51c8ab8820b4d3cf4a59019ca7247fa1e9))


### Performance

* **app:** run the heartbeat only while a connection is live ([45ede30](https://github.com/jayspar44/claude-pocket/commit/45ede30d20241d67da8b2707cc59243d63a773be))

## [1.2.0](https://github.com/jayspar44/claude-pocket/compare/v1.1.0...v1.2.0) (2026-05-30)


### Features

* add OpenAI Codex as a third CLI option ([9f6af64](https://github.com/jayspar44/claude-pocket/commit/9f6af64ccb2fad9a7a71b08e8fb7c8fa4e8e5e84))


### Bug Fixes

* address PR [#5](https://github.com/jayspar44/claude-pocket/issues/5) review feedback ([98f2a4e](https://github.com/jayspar44/claude-pocket/commit/98f2a4e83b17b797a6619ea4d91022780291552d))
* **relay:** bump submit Enter delay to 150ms + dev versionCode bump ([#6](https://github.com/jayspar44/claude-pocket/issues/6)) ([14a4d9a](https://github.com/jayspar44/claude-pocket/commit/14a4d9a219a99ef7b4a393a7d58ac8002e7110dd)), closes [#5](https://github.com/jayspar44/claude-pocket/issues/5)
* **relay:** revert bracketed paste, bump submit Enter delay to 150ms ([edf02e0](https://github.com/jayspar44/claude-pocket/commit/edf02e0ecc09206a48222fb37dc97ed6375977f8))
* **relay:** use bracketed paste for submit to avoid Enter race ([703e986](https://github.com/jayspar44/claude-pocket/commit/703e98688fc4481a1cf81e013167f2e3938bf8b5))

## [1.1.0](https://github.com/jayspar44/claude-pocket/compare/v1.0.0...v1.1.0) (2026-05-25)


### Features

* **app:** add inline / autocomplete component ([b13b521](https://github.com/jayspar44/claude-pocket/commit/b13b521c091f8fbc0006fcb1096aaae58917501a))
* **app:** add useCommands hook for slash command data ([e2311cd](https://github.com/jayspar44/claude-pocket/commit/e2311cd40c3695511b218f74290b3905c0401151))
* **app:** add useHoldRepeat hook for keyboard-style auto-repeat ([c020123](https://github.com/jayspar44/claude-pocket/commit/c0201232346b374f2ba7e6ec3c8439004de19d36))
* **app:** arrow buttons auto-repeat on hold ([feda27d](https://github.com/jayspar44/claude-pocket/commit/feda27d5ee5fb5454ca8120eca67d6af8eb55828))
* **app:** compose CommandAutocomplete with InputBar in Terminal page ([1d6143b](https://github.com/jayspar44/claude-pocket/commit/1d6143b79a036af824059308183e4720e382dd98))
* **app:** expose value + caret + setValueAndCaret from InputBar ([e6a44d3](https://github.com/jayspar44/claude-pocket/commit/e6a44d30b75ddebe5e68da96b7b7fee771a81891))
* **app:** long-press Send button → raw send (no Enter) ([c7bd9cf](https://github.com/jayspar44/claude-pocket/commit/c7bd9cf2fd51fe029a96cc32836943508dacf7a0))
* **app:** pass cliType to CommandPalette so list matches active CLI ([5579c31](https://github.com/jayspar44/claude-pocket/commit/5579c312de85ec2e7177217f13a8790c88a7b7e3))
* **build:** refuse to build flavor from wrong project folder ([8adbb15](https://github.com/jayspar44/claude-pocket/commit/8adbb150b581f8c4a1282652be82176b17079445))
* **relay:** add filesystem-based command discovery ([c2669c4](https://github.com/jayspar44/claude-pocket/commit/c2669c476a245fe39ba8586da6bc0d35a2f040fd))
* **relay:** add markdown frontmatter + toml parsers for command discovery ([e9c464d](https://github.com/jayspar44/claude-pocket/commit/e9c464d9108942d703e7c244284b76c971070b88))
* **relay:** discover claude plugin commands via plugin list --json ([8ccb4ca](https://github.com/jayspar44/claude-pocket/commit/8ccb4ca765bef1eeb3a4740462ec7a598d136435))
* **relay:** orchestrate command discovery across all sources ([52c222b](https://github.com/jayspar44/claude-pocket/commit/52c222b78ebc2a64a4bb89a4767ac9c3eb6a5e38))
* **relay:** ship built-in command tables for claude + agy ([c41c1d8](https://github.com/jayspar44/claude-pocket/commit/c41c1d86ddb93a5df8ddcb867005219f63898db6))
* **relay:** wire /api/commands to new discovery pipeline ([f5e6925](https://github.com/jayspar44/claude-pocket/commit/f5e692530b80bcb64098002b61175c178b53849b))


### Bug Fixes

* **app:** float / autocomplete above input bar so input stays visible ([4398e1a](https://github.com/jayspar44/claude-pocket/commit/4398e1af72b3f360093266bef885bc14d58c9074))
* **app:** keep layout viewport pinned to visual viewport on resize ([4bcf9b3](https://github.com/jayspar44/claude-pocket/commit/4bcf9b3cd12f7c8f7869209e968fef04b48a523c))
* **app:** pin Terminal container to layout viewport top ([b654524](https://github.com/jayspar44/claude-pocket/commit/b65452465020cca82f0f43ed3e521fc591705ee0))
* **app:** suppress mobile-browser gesture interception on arrow hold ([564359d](https://github.com/jayspar44/claude-pocket/commit/564359d33cc7e0e3ccd0497a819ff8acfe23edd1))
* **build-aab:** route flavor to matching folder for env file pickup ([1d8a2b4](https://github.com/jayspar44/claude-pocket/commit/1d8a2b4566fb7df1df9446607437fbae69cf4bd6))
* **build:** add explicit R import so non-prod flavors compile ([d1dbf40](https://github.com/jayspar44/claude-pocket/commit/d1dbf402a10fdd8919bc269c9d62cf6d11aa0345))
* **build:** patch applicationId per flavor + restore build.gradle after build ([5bc77c3](https://github.com/jayspar44/claude-pocket/commit/5bc77c36ba3df705e379c3d53c1eb5302d43eaf7))
* **relay:** clear CLI readline buffer before each submit ([e52b1d0](https://github.com/jayspar44/claude-pocket/commit/e52b1d06fc408f317016a62a410ea1889673bf5b))
* **relay:** drop unused absPath destructure in buildCommand ([b10affe](https://github.com/jayspar44/claude-pocket/commit/b10affe61a9da1038b5733f939f46acbc2444a56))
* **relay:** replace agy builtins with canonical /help list (34 cmds) ([6cae0ee](https://github.com/jayspar44/claude-pocket/commit/6cae0ee2cdd009320976a96b36a7221dfba266cb))
* use glob test pattern instead of dir arg (node 22 quirk) ([ae8cec5](https://github.com/jayspar44/claude-pocket/commit/ae8cec5f10b94d5af3ebf33ebe6565293a763be0))

## [1.0.0](https://github.com/jayspar44/claude-pocket/compare/v0.5.4...v1.0.0) (2026-05-24)


### Features

* add CLI type picker to instance manager ([831341a](https://github.com/jayspar44/claude-pocket/commit/831341a8d821910f0efa8b9245f325036f9986cc))
* add cliType to instance model and default CLI setting ([a8af3a0](https://github.com/jayspar44/claude-pocket/commit/a8af3a05044236e439d75dbb681011dbc4e825d9))
* add geminiCommand to relay config ([ae95e71](https://github.com/jayspar44/claude-pocket/commit/ae95e71e6c6d037aa333b375764e7d3ec84be7d9))
* auto-update Antigravity CLI before PTY start (symmetric with Claude) ([62e07d0](https://github.com/jayspar44/claude-pocket/commit/62e07d099decb60a80ab5f3eee094cb006aaa834))
* make PtyManager accept and use cliType parameter ([38d0391](https://github.com/jayspar44/claude-pocket/commit/38d0391c6a3863cfd98921418ebe400c8b4f814d))
* multi-CLI support (Claude + Gemini) ([8751dd3](https://github.com/jayspar44/claude-pocket/commit/8751dd3bd707d65a74a25cc31cbfa3cee65dc17a))
* pass cliType through PtyRegistry to PtyManager ([a64e0f4](https://github.com/jayspar44/claude-pocket/commit/a64e0f4681fbc2da32aff460f466acb177d7c1b1))
* pass cliType through WebSocket and REST API ([f9a743e](https://github.com/jayspar44/claude-pocket/commit/f9a743e51717f0dd385b48b40d0ea4d1615f278c))
* show CLI type dynamically in status bar ([2acd818](https://github.com/jayspar44/claude-pocket/commit/2acd8185f286d62b1376bb31fc41dbbae454f7d7))


### Bug Fixes

* centralize Gemini -> Antigravity cliType migration ([6a7fd6e](https://github.com/jayspar44/claude-pocket/commit/6a7fd6ef2941b1df340f28f6b6b62b89b8fb6c01))
* strip CLAUDECODE env var from PTY spawn environment ([0b3a52a](https://github.com/jayspar44/claude-pocket/commit/0b3a52a8ccfae2bb0ca78a52b9ee455daff55450))
* update cliType on existing stopped instances ([90e2b8e](https://github.com/jayspar44/claude-pocket/commit/90e2b8ea473435156b73ce1ce27876fb923ccf28))
* use effectiveWorkingDir for pty.spawn cwd ([049bf61](https://github.com/jayspar44/claude-pocket/commit/049bf61d40d6cc6a6fd18804bf57f1a9163be6c6))

### [0.5.4](https://github.com/jayspar44/claude-pocket/compare/v0.5.3...v0.5.4) (2026-02-26)

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
