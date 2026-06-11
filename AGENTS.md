# AGENTS

## Workspace Map

- Monorepo layout: `packages/*` for libraries, `apps/*` for apps.
- Primary package: `packages/react-native-nitro-markdown`.
- Example app (Expo Router): `apps/example`.
- Native modules:
  - iOS: `packages/react-native-nitro-markdown/ios`
  - Android: `packages/react-native-nitro-markdown/android`
  - C++ core: `packages/react-native-nitro-markdown/cpp`

## Tooling

- Package manager: `bun`.
- Repo scripts live in `package.json` (root) and per-package `package.json`.
- Bun workspaces are the only orchestration layer; root scripts delegate with `bun run --cwd ...` (no Turborepo).
- Dependency updates should run from monorepo root, sequentially. Running `bun update` in multiple workspaces at once can race on the shared lockfile/node_modules and trigger `EEXIST` link errors.
- Lint config uses `eslint-config-expo-magic` via root `eslint.config.js`; formatting is handled by lint (no separate prettier).
- Generated outputs (`lib/**`, `nitrogen/generated/**`) are excluded from lint.
- Node scripts under `scripts/**` and `packages/*/scripts/**` run with script globals (`require`, `module`, `process`, `__dirname`, `Buffer`) and allow `console` logging; keep these overrides in `eslint.config.js`.
- Example app styles should prefer `boxShadow` over legacy shadow props to satisfy `expo/prefer-box-shadow`.

## Development Commands

- Example app (Expo Router):
  - iOS: `bun run example:ios`
  - Android: `bun run example:android`
  - Dev server: `bun run example:start`
- Tests (package):
  - JS tests: `bun run test -F react-native-nitro-markdown`
  - C++ tests: `bun run test:cpp`
  - Typecheck: `bun run typecheck`
  - Lint: `bun run lint`

## Generated Code

- Do not edit `packages/react-native-nitro-markdown/nitrogen/generated` directly.
- If Nitro specs change, run `bun run codegen` in the package.
- `nitro.json` autolinking uses `all`/`ios`/`android` object entries; avoid deprecated direct `cpp`/`swift`/`kotlin` keys.
- Keep parser transport package-level and simple for consumers: JSON parse API only, no runtime transport toggles in app code.

## Native Code Patterns

- **C++ virtual inheritance**: `HybridObject(TAG)` must be called in the most-derived class constructor, not just in the spec base class.
- **Android native init**: `NitroMarkdownOnLoad.initializeNative()` is called in `NitroMarkdownPackage.init {}` (runs during React Native autolinking).
- **Kotlin 2.0**: `finalize()` is removed. Use `HybridObject.dispose()` for cleanup.
- **Thread safety**: iOS uses `NSLock`, Android uses `synchronized(lock)`. Listeners are notified outside locks to prevent deadlock.
- **Nitro callbacks**: Native-to-JS callback dispatch is asynchronous. Tests must await or use timeouts.
- Guard `static_cast<int>` from float/double against NaN/Inf.

## Docs + Examples

- Keep `README.md` and `apps/example` in sync with API changes.
- Update demo screens when streaming behavior or renderer props change.
- `astTransform` is post-parse AST rewriting only; do not describe it as parser/plugin syntax extension support.
- Pipeline order for `Markdown`: `beforeParse` plugins (sorted by `priority` desc) -> parse/sourceAst -> `afterParse` plugins (sorted by `priority` desc) -> `astTransform` -> render.
- `MarkdownPlugin.priority` is optional (default `0`); higher runs first. Sorting is stable.
- `onError` receives `(error, phase, pluginName?)` and fires per-failure; it does not abort remaining pipeline steps.
- Keep the example tabs focused on `index`, `render-default`, `render-default-styles`, `render-custom`, and `render-stream`.

## Streaming

- `MarkdownStream` batches updates via `updateStrategy` (`"raf"` or `"interval"`).
- Avoid per-token UI updates; prefer batching (50-100ms) for large documents.
- Stream demo chunking must keep fenced code lines and table rows intact.
- `incrementalParsing` is enabled by default for append-only updates.
- `MarkdownSession` listeners are range-based (`from`, `to`); `MarkdownStream` consumes deltas via `getTextRange()` first and falls back to `getAllText()` for non-contiguous ranges.
- `MarkdownSession.reset(text)` replaces full buffer and resets `highlightPosition`; `replace(from, to, text)` is partial. Both emit range events.
- If any plugin uses `beforeParse`, incremental AST optimization is disabled.
- Keep stream fixes in package internals, not in demo app logic.

## Renderer Notes

- Default renderers should look consistent on iOS/Android.
- Math rendering is package-level RaTeX only; keep the previous MathJax/SVG renderer confined to the example benchmark.
- Use platform-neutral visuals for task checkboxes (no OS glyphs).
- Table renderer renders immediately with estimated widths, then refines after measurement (never gates on layout).
- Table measurement is debounced to avoid stream-time thrashing.
- `tableOptions` (`minColumnWidth`, `measurementStabilizeMs`) flows through `MarkdownContext`.
- `highlightCode` enables syntax highlighting via `defaultHighlighter` or custom `CodeHighlighter`; colors from `theme.colors.codeTokenColors`.
- Custom renderers only pre-map extra props for specific node types; for `html_inline`/`html_block` use `node.content` directly.
- Android: set `headingWeight` explicitly for custom fonts without bold variants.

## Documentation Maintenance

- Update `CHANGELOG.md` when bumping versions or fixing bugs.
- Keep `README.md` paths repo-relative (never absolute local filesystem paths).
- Do not add `## Test` sections to PR descriptions or release notes.

## Web Stance

- Web is not supported: every entrypoint (including `./headless`) requires Nitro Modules (JSI). Do not add a `browser` field or web entry without adding a real web implementation and a smoke proof.
