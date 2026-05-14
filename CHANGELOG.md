# Changelog

## [1.0.2](https://github.com/adamtootle/reed/compare/v1.0.1...v1.0.2) (2026-05-14)


### Bug Fixes

* include resource bundle in release zip and formula install ([#21](https://github.com/adamtootle/reed/issues/21)) ([c9bb2d2](https://github.com/adamtootle/reed/commit/c9bb2d25212af1673355da92d5613ad453ee673a))

## [1.0.1](https://github.com/adamtootle/reed/compare/v1.0.0...v1.0.1) (2026-05-13)


### Bug Fixes

* code block styling — light-mode visibility and editor line stripes ([#9](https://github.com/adamtootle/reed/issues/9)) ([988d1cd](https://github.com/adamtootle/reed/commit/988d1cdee3f90df20f19dd21454c981a5b3f0c5c))
* distinguish connecting, ready, and reconnecting pill states ([#4](https://github.com/adamtootle/reed/issues/4)) ([75e2182](https://github.com/adamtootle/reed/commit/75e218280600d9a4301d780bd0eb1e0c5c072da3))
* honor nested .gitignore files in file tree ([#3](https://github.com/adamtootle/reed/issues/3)) ([f2a7fd8](https://github.com/adamtootle/reed/commit/f2a7fd8d8b8942ca34da66245f13c78167f2956f))
* make sidebar expand handle visible when collapsed ([#6](https://github.com/adamtootle/reed/issues/6)) ([34aa3ec](https://github.com/adamtootle/reed/commit/34aa3ec71a03efa7c35901a5fc7e2f4ace22c24f))
* serve bundled frontend assets in release builds ([#19](https://github.com/adamtootle/reed/issues/19)) ([7a730e7](https://github.com/adamtootle/reed/commit/7a730e78d26bb100a897edb2fd073db21c3148ec))
* serve user assets through Vite proxy in dev ([#18](https://github.com/adamtootle/reed/issues/18)) ([1ef08bf](https://github.com/adamtootle/reed/commit/1ef08bf5c8578dc38ac64ada583263ff2a33dfba))

## 1.0.0 (2026-05-10)


### Features

* add --port flag with dev/prod defaults ([685aba4](https://github.com/adamtootle/reed/commit/685aba4acfabd0f3cbf4eb90cc1ce2d82a7ed3d7))
* add /api/config route, UTType MIME types, enforce .md in file API ([c7f57a9](https://github.com/adamtootle/reed/commit/c7f57a9506c2a45f1be3eb9c301a825bdfcb14a5))
* add /api/files, /api/file, and wildcard static file routes (slices 2 and 3) ([cad9bd3](https://github.com/adamtootle/reed/commit/cad9bd3d537ad4eb6d41213bfae720cad142cb03))
* add file tree builder with depth and count caps ([05fada1](https://github.com/adamtootle/reed/commit/05fada1c650055835101c1cb08d703ced0481083))
* add gitignore parser with glob matching ([dcb0a8c](https://github.com/adamtootle/reed/commit/dcb0a8c5733ada012ce964d2662fa78a9a6ba9b5))
* add path traversal protection ([03f0889](https://github.com/adamtootle/reed/commit/03f088904cab433d4932feec7ddc78066aa241ac))
* add SSE broadcaster and /events route ([495cfa5](https://github.com/adamtootle/reed/commit/495cfa5d9cf1b685cf3f45250cea6978f5903dff))
* api client with getConfig, getFiles, getFile, putFile ([c32eebf](https://github.com/adamtootle/reed/commit/c32eebfc64d90096cef6a4e37bdc255f4e7dd4ec))
* app state types and tiny pub/sub store ([642c2ec](https://github.com/adamtootle/reed/commit/642c2ec4693c94f5fe3f35600e9847bd8cde6b16))
* autosave debouncer with trigger/flush/cancel ([97f68f3](https://github.com/adamtootle/reed/commit/97f68f3fa49d8fbd1a6946aa867917c72063fa18))
* autosave with debounce, blur-flush, save-on-file-switch ([ab18dd3](https://github.com/adamtootle/reed/commit/ab18dd32f21926b58031fbacc67fd5f7a690c9be))
* bidirectional scroll sync between editor and preview ([6d09d28](https://github.com/adamtootle/reed/commit/6d09d280ec333f2ac2eb948f65b312a0556cb748))
* boot sequence wires config, file tree, pill, theme ([899f99d](https://github.com/adamtootle/reed/commit/899f99df9464bec828c54122a413550605eb3fd1))
* centralize empty/error state messages ([6bd6337](https://github.com/adamtootle/reed/commit/6bd633745321f1a9383083e5ac3cacbb9e47c9da))
* CLI entry, HTTP server, browser open (slice 1) ([c374875](https://github.com/adamtootle/reed/commit/c374875bad3fd22b4c710c1b98bf14bf6b1fa8f9))
* CodeMirror editor with markdown lang and file loading ([acf32ef](https://github.com/adamtootle/reed/commit/acf32ef79ebc3f92056c610bc8d8b97e14f73ee1))
* dark cursor, markdown wrap shortcuts, GitHub-style palette ([73e5c8d](https://github.com/adamtootle/reed/commit/73e5c8db40f54a335d8149faf717e0f9b3e6ee56))
* file tree sidebar with sort, expand/collapse, active row ([597078d](https://github.com/adamtootle/reed/commit/597078df4656381bbe4fd63a423524f5b8157a52))
* file watcher and SSE push for external changes (slice 4) ([e37752c](https://github.com/adamtootle/reed/commit/e37752ce759d4e84db00c6dac96b17038e268695))
* layout shell and pill styles ([8c2f2a9](https://github.com/adamtootle/reed/commit/8c2f2a9e7efa787b3a5b7cae9c5824b0673aca4c))
* lazy-loaded mermaid renderer with source-keyed cache ([fc7b957](https://github.com/adamtootle/reed/commit/fc7b9576ce7303859044588d70ece2970ab7aae4))
* markdown-it preview pipeline with GFM/highlight.js/footnotes/katex/alerts ([364e0b0](https://github.com/adamtootle/reed/commit/364e0b0009c580fa515e323f8cdeae14d2730659))
* Mode A markdown decoration plugin and CSS ([3df4a79](https://github.com/adamtootle/reed/commit/3df4a79cb0afc9b74376712e4a1c13c9c2285aa8))
* Mode B split pane with live preview, splitter, mermaid post-render ([ea87c57](https://github.com/adamtootle/reed/commit/ea87c57cd9593a58d15dc48442eec2888a49aee7))
* mode toggle via compartment swap + Cmd+E shortcut ([bc0c245](https://github.com/adamtootle/reed/commit/bc0c245de942d9f00a664ac9feafe91755298dad))
* pill component with theme · mode · status ([dffa4b4](https://github.com/adamtootle/reed/commit/dffa4b438ad71396e821bb0f08a96217e2b48935))
* save/SSE pill state machine ([60ed8a5](https://github.com/adamtootle/reed/commit/60ed8a5cf3692a32a400160900e447e06dcf1f4a))
* sidebar collapse with chevron, edge handle, Cmd+\ shortcut ([6e3f24e](https://github.com/adamtootle/reed/commit/6e3f24e87e63e2ed5b978d0e8fac2cb34fc7f9f6))
* SSE client with exponential backoff reconnection ([3f82772](https://github.com/adamtootle/reed/commit/3f82772b6c8da80ff639d699496305ad8df4758b))
* SSE-driven external change handling with conflict banner ([eb94f56](https://github.com/adamtootle/reed/commit/eb94f56400b861f8d77a5a54fd465e954af7d425))
* theme controller (Auto/Light/Dark + prefers-color-scheme) ([67e3dad](https://github.com/adamtootle/reed/commit/67e3dad7bd792b81da847f7867dc6f883922d257))


### Bug Fixes

* add dynamic subdirectory watching and deinit cleanup in FileWatcher ([c7a7860](https://github.com/adamtootle/reed/commit/c7a786027c1ba69dc1c088819f66451e251f38db))
* allow README files in file API, exit cleanly on SIGINT/SIGTERM ([3f7c88b](https://github.com/adamtootle/reed/commit/3f7c88b067056fb71753bd0a8cd3899e452e5b44))
* bump happy-dom, swap markdown-it-katex, clean tsconfig and comments ([e37cbfe](https://github.com/adamtootle/reed/commit/e37cbfed2322a6ae540fb41471de5a05830d9c3d))
* editor scroll, dark scrollbars, and centered column with breathing room ([aabc98a](https://github.com/adamtootle/reed/commit/aabc98a647ddb56065dff8e97a451e250c330fb8))
* enable GFM in editor's markdown parser for runtime parity ([c9529c8](https://github.com/adamtootle/reed/commit/c9529c864c50c0b39f6ab8b02228f53acaaa0704))
* force-exit on SIGINT/SIGTERM via dispatch source ([0b2aec6](https://github.com/adamtootle/reed/commit/0b2aec6e2b439b7fbe97bc896326430101224c29))
* guard SSEClient against double-start and warn on malformed payloads ([2667c70](https://github.com/adamtootle/reed/commit/2667c70281c2f92bb105e1f2d1d597b0c0a77b42))
* post-milestone follow-ups (setDoc echo, reconnect catch-up, sidebar title, keepalive scope) ([9517d6b](https://github.com/adamtootle/reed/commit/9517d6b66471093155e487aa91770f48113a6cc0))
* serialize FileWatcher mutations on queue, use JSONEncoder for SSE payload ([39e315d](https://github.com/adamtootle/reed/commit/39e315dc966c66bd59d963094766f99d1b22f106))
* tighten PathValidationError assertions; document symlink decision ([10c3e6f](https://github.com/adamtootle/reed/commit/10c3e6f39459d75aa814908dd09c7a56a329c4d4))
* tighten port probe and test error type ([cc1108b](https://github.com/adamtootle/reed/commit/cc1108b9e93bc3b069c5bc31cb6e8d828112e65c))
* treat embedded-slash gitignore patterns as rooted per spec ([4766ecc](https://github.com/adamtootle/reed/commit/4766ecc3a1de0c8a0ba61578ba55d0128321277a))


### Continuous Integration

* set up release-please and macOS publish pipeline ([70c63f0](https://github.com/adamtootle/reed/commit/70c63f0d384f66715eeba7e04a325d3b3466e923))
