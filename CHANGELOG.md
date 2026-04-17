# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.4] - 2026-04-17

### Added

- `ParserOptions.html` opt-in flag for native `html_inline` and `html_block` parsing. HTML remains disabled by default and still requires custom renderers.
- Regression coverage for plugin replacement, parser option toggles, and native HTML AST parsing.

### Changed

- Upgraded Nitro Modules and Nitrogen to `0.35.4`; peer dependency floor is now `react-native-nitro-modules >=0.35.4`.
- Aligned the example app with current Expo SDK 55 patch releases and React Native `0.83.4`.
- Added an example-app HTML parser demo with custom `html_inline` and `html_block` renderers.
- Switched long example renderer screens to `Markdown` virtualization to keep large documents responsive.
- Cached default renderer style sheets and memoized code highlighting work in hot render paths.
- Updated safe toolchain patches: `turbo` `2.9.6`, `eslint-config-expo-magic` `2.4.0`, `react-native-builder-bob` `0.41.0`, `@swc/core` `1.15.26`, and `marked` `17.0.6`.
- Migrated `nitro.json` to the current Nitro autolinking schema.

### Fixed

- `Markdown` now re-runs the parse/plugin pipeline when the `plugins` prop changes.
- Android `HybridMarkdownSession` now rejects infinite range values before range slicing or replacement.
- Native Android and iOS build inputs now exclude standalone C++ test sources.
- Image rendering now avoids post-unmount dimension updates during virtualized list recycling.

## [0.5.3] - 2026-03-05

### Fixed

- **Android**: Added `consumer-rules.pro` with explicit `-keep` rules for Nitro Hybrid Object classes and `Func_*` JNI wrappers — prevents R8 full-mode stripping in release builds.
- **Android**: `HybridMarkdownSession.append()` now enforces a 10 MB buffer limit to prevent OOM.
- **Android**: `highlightPosition` getter is now synchronized; added `@GuardedBy` annotations throughout `HybridMarkdownSession`.
- **Android**: `HybridMarkdownSession` now implements `onDestroyed()` + `finalize()` to clear listeners and prevent post-destroy callbacks.
- **Android**: `NitroMarkdownPackage` uses lazy native init so a `System.loadLibrary` failure does not crash ClassLoader initialization.
- **Android**: CMake version range (`3.18.1...3.28`) and Release/Debug compiler optimization flags.
- **iOS**: `HybridMarkdownSession.replace()` now uses `NSMutableString.replaceCharacters(in:NSRange:)` for UTF-16-consistent indices, matching all other session methods.
- **iOS**: `notifyListeners()` is called outside the `NSLock` scope in all mutating methods, preventing potential deadlock when a listener calls back into the session.
- **iOS**: Added `isFinite` guards in `getTextRange()` and `replace()` to reject NaN/Infinity inputs.
- **C++**: All five md4c callbacks (`enterBlock`, `leaveBlock`, `enterSpan`, `leaveSpan`, `text`) are now `noexcept` with `try/catch(...)` — prevents undefined behavior from C++ exceptions escaping a C callback boundary.
- **C++**: JSON size estimation uses overflow-safe arithmetic with a 64 MB cap.
- **JS/TS**: `MarkdownParserModule` creation is now wrapped in try/catch with `__DEV__` logging; `parseMarkdown`/`parseMarkdownWithOptions` return an empty document AST on failure instead of throwing.
- **JS/TS**: `plugins` added to `useEffect` dependency array in `MarkdownStream`.
- **JS/TS**: `onLinkPress` result is wrapped with `Promise.resolve()` to support both sync and async handlers.
- **JS/TS**: Package exports are now explicit named exports; `sideEffects: false` set for tree-shaking.

## [0.5.2] - 2026-03-04

### Fixed

- Android: `NitroMarkdownPackage` extends `BaseReactPackage` instead of deprecated `TurboReactPackage`.
- Android: `cpp-adapter.cpp` now uses `facebook::jni::initialize` + `registerAllNatives()` instead of the deprecated `initialize(vm)` wrapper.

## [0.5.1] - 2026-03-04

### Added

- `Markdown` `onError` callback for structured error reporting during parse and plugin pipeline phases. Receives `(error: Error, phase: 'parse' | 'before-plugin' | 'after-plugin', pluginName?: string)`.
- `MarkdownPlugin` `priority?: number` field — higher value runs first; default is `0`. Plugins are stable-sorted by priority before execution.
- `Markdown` `tableOptions` prop: `minColumnWidth` (default `60`) and `measurementStabilizeMs` (default `140`) for per-instance table layout tuning.
- `Markdown` `highlightCode` prop — set to `true` for built-in syntax highlighting, or pass a custom `CodeHighlighter` function for full control.
- Built-in regex-based syntax highlighter (`defaultHighlighter`) covering JS/TS, Python, and Bash. Renders code token spans using `codeTokenColors` theme values.
- `MarkdownTheme.colors.codeTokenColors` — per-token color map (`keyword`, `string`, `comment`, `number`, `operator`, `punctuation`, `type`, `default`). Defaults provided in `defaultMarkdownTheme`.
- `stripSourceOffsets(node)` headless utility — recursively removes `beg`/`end` source position fields for compact AST serialization.
- `MarkdownSession.reset(text)` — replaces full buffer content and emits a full-range change event.
- `MarkdownSession.replace(from, to, text)` — partial buffer mutation; returns new total UTF-16 length.
- `NodeStyleOverrides` is now a discriminated type map: text-type nodes accept `TextStyle`, view-type nodes accept `ViewStyle`. Prevents mismatched style shapes at compile time.
- New exports: `defaultHighlighter`, `CodeHighlighter`, `HighlightedToken`, `TokenType`.
- New test coverage: `onError` behavior, plugin priority ordering, session `reset`/`replace` contracts.

### Changed

- Upgraded to Nitro Modules `0.35.0`, Expo SDK 55, React Native 0.83.2, React 19.2.0.
- iOS minimum deployment target raised to `15.1` (aligns with Expo SDK 52+, New Architecture only).
- Peer dependency `react-native-nitro-modules` range changed from `"*"` to `">=0.35.0"`.
- `useMarkdownSession` now exposes `reset(text)` and `replace(from, to, text)` alongside existing `clear()`.
- Table renderer internals refactored into sub-modules (`types`, `utils`, `reducer`, `cell-content`) — no behavior change.
- Turbo pipeline now includes `test:cpp` and `size` tasks.
- Bundle size budgets added via `size-limit` (main ≤40 kB CJS/38 kB ESM, headless ≤8 kB CJS/7 kB ESM).

### Fixed

- Android: `NitroMarkdownPackage` now calls `NitroMarkdownOnLoad.initializeNative()` instead of the deprecated `System.loadLibrary("NitroMarkdown")`, fixing a startup crash on Nitro 0.35.0.

## [0.5.0] - 2026-02-22

### Added

- `Markdown` now supports `astTransform` for consumer-side AST transforms between parse and render.
- `onParseComplete` now receives the transformed AST (when `astTransform` is provided).
- Package index exports `AstTransform`, `MarkdownProps`, and `MarkdownStreamProps`.
- Added transform coverage tests (no-op, mutation, error fallback, and `MarkdownStream` passthrough).
- Example custom renderer screen now demonstrates AST emoticon transform (`:wink:` -> `😉`).
- `Markdown` plugin pipeline via `plugins` prop:
  - `beforeParse(markdown) => markdown`
  - `afterParse(ast) => ast`
- `Markdown` `sourceAst` prop to render a pre-parsed AST and skip native parse.
- `MarkdownStream` `incrementalParsing` prop (default `true`) for append-optimized stream AST updates.
- `Markdown` large-document virtualization controls:
  - `virtualize`
  - `virtualizationMinBlocks`
  - `virtualization` (FlatList tuning)
- `MarkdownSession` range-based mutation API:
  - `append(chunk)` now returns new text length
  - `getLength()`
  - `getTextRange(from, to)`
  - `addListener((from, to) => void)`
- Native parser plain-text helpers:
  - `extractPlainText(text)`
  - `extractPlainTextWithOptions(text, options)`
- New regression/perf tests:
  - stream delta range behavior
  - plain-text extraction fallback behavior
  - stream update performance budget
- New tests for plugin pipeline, `astTransform` behavior, incremental parsing safety, and table rendering.

### Changed

- README now documents `astTransform` usage and export surface.
- README now explicitly clarifies that `astTransform` is post-parse AST rewriting (not parser plugin/syntax extension support).
- Example app now installs `expo-font` to satisfy `@expo/vector-icons` peer dependency.
- Safe dependency updates: `marked` `17.0.3`, `rimraf` `6.1.3`, `turbo` `2.8.10`.
- Root `react-native-nitro-modules` dependency is pinned to `0.33.9` to avoid npm override conflict in Expo tooling.
- Table renderer now uses immediate estimated column widths and refines in background measurement, avoiding blank-table states when layout callbacks are delayed.
- Native parser JSON serialization path was optimized in C++ to reduce allocation/copy overhead during AST conversion.
- `Markdown` now uses an internal small LRU parse cache for repeated render inputs.
- `Markdown` parse cache now bypasses very large inputs to avoid clone/cache overhead on long documents.
- Headless parser is JSON-only transport to keep API simple and avoid slower flat transport overhead.
- Table renderer now keeps column widths monotonic during stream updates to reduce visible layout jump/jitter.
- `MarkdownStream` now consumes native `(from, to)` ranges and prefers `getTextRange()` for contiguous appends, reducing full-buffer copies during streaming.
- `Markdown` `virtualize` now supports `"auto"` for threshold-driven virtualization.
- Table renderer now quantizes estimated column width updates to reduce stream-time layout thrashing.
- `Markdown` now computes flattened text lazily only when `onParseComplete` is provided.
- `Markdown` render path now memoizes `NodeRenderer` and virtualization callbacks to reduce repeated work in large documents.
- CI now enforces JS stream update budgets and native C++ parse/memory perf budgets.

### Fixed

- Package `prebuild` script now uses `bun run codegen` (no npm invocation).
- Example Metro config now preserves Expo default `watchFolders` entries while adding monorepo root.
- Table rendering race condition on iOS where measurement-phase timing could prevent visible table render.
- Stream incremental parser now correctly falls back to full parse when fenced code closing markers are split across chunks.
- Stream table rendering now reduces visible jump by applying coarser width estimate update steps during fast chunk append cycles.

## [0.4.2] - 2026-02-09

### Fixed

- Table renderer: `tableRowEven` theme color now properly applies to even rows (0, 2, 4...)
- Table renderer: `styles.table.backgroundColor` now correctly overrides the table background instead of just the container

## [0.4.1] - 2026-02-04

### Fixed

- Android heading font rendering when custom fonts don't have bold variants
- Stronger theme typing for better TypeScript inference

## [0.4.0] - 2026-02-04

### Added

- Custom styles support per Markdown node type
- Enhanced theme integration with more flexible theming options
- Improved style override capabilities

### Changed

- Refactored Markdown parser and renderer for better performance
- Enhanced AST node processing

## [0.3.2] - 2026-01-25

### Fixed

- List and paragraph layout issues
- Improved spacing between block-level elements

### Changed

- Enhanced example app with parsing performance metrics display

## [0.3.1] - 2026-01-25

### Added

- Plain text extraction API (`extractPlainText`)
- Markdown session recyclability check for memory optimization
- Session management improvements for streaming use cases

### Changed

- Updated `react-native-nitro-modules` dependency to latest version
- Improved session lifecycle management

## [0.3.0] - 2026-01-09

### Added

- Developer experience improvements
- Better TypeScript configuration for Node.js compatibility
- Enhanced CI verification for build artifacts

### Changed

- Centralized dependencies management
- Updated build tooling
- Refactored benchmark system

## [0.2.1] - 2026-01-09

### Added

- MIT License
- Improved documentation and developer experience
- Better CI/CD pipeline

### Fixed

- TypeScript configuration for improved type checking
- Build artifact verification in CI

## [0.2.0] - 2026-01-08

### Added

- Markdown streaming support with real-time rendering (`MarkdownStream` component)
- `useMarkdownSession` hook for managing streaming sessions
- Native streaming parser implementation in C++
- Token-by-token update support for AI/chat use cases
- Headless and non-headless renderer separation for all use cases
- Default renderers for all Markdown node types
- Comprehensive example app with streaming demos

### Changed

- Reorganized package structure
- Regenerated Nitro bindings on latest version
- Improved Android build environment
- Renamed markdown nitro implementation for clarity

## [0.1.2] - 2025-12-23

### Added

- Centralized dependencies management across monorepo
- Updated tooling and build scripts
- Refactored benchmark comparison system

### Changed

- Migrated to unified dependency versions
- Improved monorepo organization

## [0.1.1] - 2025-12-11

### Fixed

- Correctly parse inline code in list items without unwanted line breaks

### Changed

- Memoized markdown renderer component for better performance
- Optimized C++ string allocations and moves
- Removed unused imports and standardized code style

## [0.1.0] - 2025-12-11

### Added

- Initial release
- Native C++ Markdown parser using md4c
- JSI integration for synchronous parsing
- Full renderer with React Native components
- Headless API for custom rendering
- GFM support (tables, strikethrough, task lists, autolinks)
- LaTeX math parsing (inline and block)
- React Native MathJax SVG integration
- TypeScript support with full type definitions
- Monorepo structure with example app
- Comprehensive benchmark suite comparing against JavaScript parsers

### Notes

- Migrated from private repository
- Initial implementation using Nitro Modules architecture
