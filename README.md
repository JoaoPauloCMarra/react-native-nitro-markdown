# react-native-nitro-markdown

[![npm version](https://img.shields.io/npm/v/react-native-nitro-markdown?color=f97316&label=npm)](https://www.npmjs.com/package/react-native-nitro-markdown)
[![npm downloads](https://img.shields.io/npm/dm/react-native-nitro-markdown?color=22c55e&label=downloads)](https://www.npmjs.com/package/react-native-nitro-markdown)
[![CI](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/actions/workflows/ci.yml/badge.svg)](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/react-native-nitro-markdown?color=007ec6)](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/LICENSE)
[![React Native](https://img.shields.io/badge/react--native-0.86.2-61dafb)](https://reactnative.dev/docs/0.86/getting-started-without-a-framework)
[![Expo](https://img.shields.io/badge/expo-SDK%2057%20%28RN%200.86.2%29-000020)](https://docs.expo.dev/versions/v57.0.0/)
[![Nitro Modules](https://img.shields.io/badge/nitro--modules-%3E%3D0.37.0%20%3C0.38.0-black)](https://nitro.margelo.com/)
[![TypeScript](https://img.shields.io/badge/typescript-6.0-3178c6)](https://www.typescriptlang.org/)

**A native Markdown engine for React Native.** Native **C++ parsing** for
CommonMark and GitHub Flavored Markdown, real React Native rendering, first-class
**streaming** for LLM/chat output, and a **headless AST** API — powered by
[md4c](https://github.com/mity/md4c) and [Nitro Modules](https://nitro.margelo.com/).

<p align="center">
  <img src="https://raw.githubusercontent.com/JoaoPauloCMarra/react-native-nitro-markdown/main/readme/render.png" alt="Nitro Markdown rendering rich GitHub Flavored Markdown natively in React Native" width="250" />
  <img src="https://raw.githubusercontent.com/JoaoPauloCMarra/react-native-nitro-markdown/main/readme/themes.png" alt="The same Markdown rendered with the built-in dark theme — fully customizable themes, per-node styles, and renderers" width="250" />
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/JoaoPauloCMarra/react-native-nitro-markdown/main/readme/benchmark.png" alt="Benchmark comparing the Nitro C++ parser with JavaScript markdown parsers" width="250" />
  <img src="https://raw.githubusercontent.com/JoaoPauloCMarra/react-native-nitro-markdown/main/readme/streaming.png" alt="Streaming token-by-token markdown for LLM and chat output" width="250" />
  <img src="https://raw.githubusercontent.com/JoaoPauloCMarra/react-native-nitro-markdown/main/readme/tables.png" alt="GitHub Flavored Markdown tables and task lists rendered natively" width="250" />
</p>

## Why Nitro Markdown?

Most React Native Markdown libraries parse in JavaScript on the JS thread. Nitro
Markdown parses in a **native C++ engine** over JSI, then renders flexible React
Native components — giving you a native parser boundary with component flexibility.

- ⚡ **Native C++ parsing** — CommonMark + GFM with a benchmark harness so you
  can measure parsing and rendering on your target device ([benchmarks](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/comparison.md)).
- 🔀 **Streaming** — built for token-by-token LLM / chat output.
- 🧩 **Headless AST** — parse without UI for search, validation, indexing.
- 🎨 **Real components** — theme, override per node, or swap whole renderers.
- 📜 **Virtualization** — bounded memory and fast first screen on long docs.
- 📊 **GFM tables, task lists, inline & block math, syntax highlighting** built in.
- 🛡️ **Type-safe** — full TypeScript types for nodes, renderers, options.
- 🔒 **Safe by default** — bounded parse input (default 10 MiB UTF-8 bytes, overridable via
  `options.maxInputLength`), a hard C++ cap, seeded fuzzing and a CommonMark/GFM
  conformance corpus in the test gate, and a link/image URL policy
  ([security policy](./SECURITY.md)).

## Install

```sh
bun add react-native-nitro-markdown react-native-nitro-modules@0.37.0 ratex-react-native@0.1.14
```

```sh
# Expo development build
bunx expo install react-native-nitro-markdown react-native-nitro-modules@0.37.0 ratex-react-native@0.1.14
bunx expo prebuild
```

`react-native-nitro-modules` and `ratex-react-native` are peer dependencies
(parsing and math rendering use native code). Expo Go cannot load Nitro
modules — use a development build. Full guide: **[Installation](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/installation.md)**.

## Expo Config

No package-specific Expo config plugin is required. After installing the
package and its native peer dependencies, run `expo prebuild` and use an Expo
development build. See the [Installation guide](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/installation.md)
for the Expo and bare React Native setup.

## Quick Start

```tsx
import { Markdown } from "react-native-nitro-markdown";

export function Article() {
  return (
    <Markdown
      options={{ gfm: true, math: true }}
      onError={(error) => {
        console.error(error);
      }}
    >
      {"# Hello\nThis is **native** markdown."}
    </Markdown>
  );
}
```

Native parse failures call `onError` instead of rendering an empty document.
Headless `parseMarkdown` throws; do not treat an empty AST as success. Keep
product fonts and colors in an app wrapper around `<Markdown>`.

## Streaming (LLM / chat)

```tsx
import { useEffect } from "react";
import {
  MarkdownStream,
  useMarkdownSession,
} from "react-native-nitro-markdown";

type StreamingMessageProps = {
  subscribe: (onToken: (token: string) => void) => () => void;
  onError: (error: Error) => void;
};

export function StreamingMessage({
  subscribe,
  onError,
}: StreamingMessageProps) {
  const session = useMarkdownSession();

  useEffect(
    () => subscribe((token) => session.getSession().append(token)),
    [session, subscribe],
  );

  return (
    <MarkdownStream
      session={session}
      updateStrategy="raf"
      incrementalParsing
      onError={onError}
    />
  );
}
```

`MarkdownStream` batches native range updates. Plain-text and fenced-code
appends take an incremental path; structural updates re-parse with stable AST
node reuse. Failed updates call `onError(error, "parse")` and retain the last
valid render. For very large initial content, pass `initialParseMode="async"`
so the first frame renders without parsing. Full guide:
**[Streaming](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/streaming.md)**.

Session ranges use JavaScript UTF-16 units. An index inside a surrogate pair
(including emoji) is rejected with `invalid_range` instead of rounded.

## Headless parsing

```ts
import {
  parseMarkdown,
  parseMarkdownWithOptions,
  extractPlainText,
} from "react-native-nitro-markdown/headless";

const ast = parseMarkdown("# Title");
const mathAst = parseMarkdownWithOptions("Inline $x^2$", { math: true });
const text = extractPlainText("Hello **world**"); // "Hello world"

// Search / indexing: skip source offsets natively for a leaner AST.
const lean = parseMarkdownWithOptions(doc, { sourceOffsets: false });
```

`sourceOffsets` is optional. Set it to `false` when your headless code does not
map AST nodes back to the original Markdown source, such as for search,
indexing, validation, or plain-text extraction. Leave it omitted when you need
source ranges for diagnostics, source maps, editor selection, annotations, or
streaming/incremental AST reuse. The public headless default remains `true` so
existing consumers keep receiving `beg`/`end`; changing that default would be a
breaking AST-shape change. The ordinary string `<Markdown>` fast path chooses
`false` internally when no consumer-facing AST or source ranges are needed.

The TypeScript return type follows the option: `parseMarkdown("...")` exposes
required UTF-16 `beg`/`end` fields, while a literal
`{ sourceOffsets: false }` returns a node type without those fields. If an
options object is typed as the broad `ParserOptions`, offsets remain optional
in the result because the runtime value is not known to TypeScript.

Use the `/headless` export for AST data, plain-text extraction, indexing, or
tests without rendering UI. Parser functions throw when the native module is
unavailable, parsing fails, or native output is invalid; catch errors at your
application boundary. The headless entry still requires an iOS or Android native
runtime. Full guide: **[Headless](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/headless.md)**.

## Source AST rendering

Already have a `MarkdownNode`? Pass it via `sourceAst` to skip native parsing on
render:

```tsx
<Markdown sourceAst={ast}>{"# Cached AST"}</Markdown>
```

When `sourceAst` is provided, `beforeParse` plugins are skipped because parsing
already happened. `afterParse` plugins and `astTransform` still run.

Parser AST nodes are mutable by default for compatibility with earlier releases.
Public parser and consumer AST boundaries validate and clone trees so a
consumer callback cannot poison another cached result. The default string
render path keeps the native AST internal and skips that materialization.
Public AST hooks and custom renderers continue to use the compatibility path.
Pass
`options={{ freezeAst: true }}` when a defensive immutable tree is preferred;
this freezes nodes and child arrays before they reach plugins, transforms, and
callbacks.

## Theming & customization

Because every node renders as a real React Native component, you can restyle the
whole document, tweak a single node type, or replace a renderer outright:

```tsx
import { Markdown, darkMarkdownTheme } from "react-native-nitro-markdown";

// 1. Swap the whole theme — built-in dark preset (or any partial theme)
<Markdown theme={darkMarkdownTheme}>{content}</Markdown>;

// 2. Override individual node styles (layered on top of the theme)
<Markdown
  styles={{ heading: { color: "#7c3aed" }, code_block: { borderRadius: 16 } }}
>
  {content}
</Markdown>;

// 3. Replace a renderer entirely
<Markdown renderers={{ blockquote: MyCallout }}>{content}</Markdown>;
```

Presets: `defaultMarkdownTheme`, `darkMarkdownTheme`, `minimalMarkdownTheme` (or
`stylingStrategy="minimal"`). Compose with `mergeThemes`. Full guide:
**[Customization](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/customization.md)**.

## Common options

| Prop / option            | Default                    | What it does                                                                                                                                                                                                                                                                                        |
| ------------------------ | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `options.gfm`            | `true`                     | Tables, strikethrough, task lists, autolinks.                                                                                                                                                                                                                                                       |
| `options.math`           | `true`                     | Inline and block math nodes.                                                                                                                                                                                                                                                                        |
| `options.html`           | `false`                    | Preserve raw HTML nodes for custom renderers.                                                                                                                                                                                                                                                       |
| `options.sourceOffsets`  | `true`                     | Optional source mapping. `true` emits per-node `beg`/`end` as JavaScript UTF-16 indices; `false` omits them and skips the native UTF-16 map. Headless consumers should choose `false` unless they need source ranges. The ordinary string render fast path chooses `false` automatically when safe. |
| `options.maxInputLength` | `10485760`                 | Maximum accepted input length in UTF-8 bytes. Oversized inputs fail with a typed `input_too_large` error instead of being parsed. Values above the hard cap are clamped.                                                                                                                            |
| `options.freezeAst`      | `false`                    | Freeze parsed AST nodes and child arrays before exposing them to plugins, transforms, renderers, and callbacks.                                                                                                                                                                                     |
| `parseCache`             | `true`                     | Reuse parsed ASTs for repeated content. The cache is scoped per `<Markdown>` instance (max 32 entries); per-instance hit/miss/eviction counters are reported via `onParseComplete`'s `cacheStats`.                                                                                                  |
| `sourceAst`              | `undefined`                | Render a pre-parsed AST instead of parsing `children`.                                                                                                                                                                                                                                              |
| `onParsingInProgress`    | `undefined`                | Deprecated compatibility callback invoked after the current parse render commits. Use `onParseComplete` or `MarkdownStream` state for new code.                                                                                                                                                     |
| `onError`                | `undefined`                | Receive parser and plugin failures as `(error, phase, pluginName?)`. Native parse and session failures are typed `MarkdownError`s with stable `code` and `source`.                                                                                                                                  |
| `errorText`              | `"Error parsing markdown"` | Localized text rendered when parsing fails.                                                                                                                                                                                                                                                         |
| `imageOptions`           | `undefined`                | Image URL policy: `allowedProtocols`, `allowedHosts`, and `remoteImages: "deny"` to block remote image loading entirely.                                                                                                                                                                            |
| `highlightCode`          | `false`                    | Built-in code syntax highlighting (fixture-backed languages: JS/TS family, Python, shell).                                                                                                                                                                                                          |
| `virtualize`             | `false`                    | Virtualize top-level blocks for long documents.                                                                                                                                                                                                                                                     |

See **[Usage](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/usage.md)** for the full prop table and **[Customization](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/customization.md)** for themes, per-node styles, custom renderers, and plugins.

## Performance

Nitro Markdown optimizes the complete string → native parse → React Native
render path. The default render-only path avoids public AST validation and
cloning, omits source-offset serialization when it is safe, and collapses
contiguous plain-text runs into fewer native `Text` nodes. Use `virtualize` for
long documents so only the visible top-level blocks mount initially.

Representative development-build measurements for a ~320 KB document after
these optimizations (mount-to-layout time; absolute values vary by device,
build, and workload):

| Render path                       | iPhone 17 iOS Simulator | Pixel 7 Android Emulator |
| --------------------------------- | ----------------------- | ------------------------ |
| Rich document                     | 217.24 ms               | 291.20 ms                |
| Long document with virtualization | 150.50 ms               | 168.69 ms                |

These are development-build measurements from isolated fresh runs, not a
release-performance guarantee.

The parser-only comparison uses isolated records. The example app measures
Nitro only on the target device:

| Nitro device path | iPhone 17 iOS Simulator | Pixel 7 Android Emulator |
| ----------------- | ----------------------- | ------------------------ |
| **Offsets on**    | 71.3 ms p50             | 57.0 ms p50              |
| **Offsets off**   | 47.2 ms p50             | 37.6 ms p50              |

The JavaScript baseline is a separate Node benchmark. Each parser runs in a
fresh process and the result includes its fixture hash and runtime. The latest
macOS arm64 record for the 182,850-byte `node-complex-markdown-v1` fixture was:

| JavaScript baseline |      p50 |      p95 |
| ------------------- | -------: | -------: |
| CommonMark.js       |  5.15 ms |  9.20 ms |
| Markdown-It         |  8.59 ms | 11.91 ms |
| Marked              | 13.52 ms | 16.48 ms |

Do not compare Node and device timings as a single speed ratio. With offsets
disabled, Nitro's measured device round trip is about 34% faster than its
compatibility path. The package's advantage is the full React Native path,
native parsing without a JS parser dependency, streaming, and long-document
virtualization; no universal "fastest" result should be inferred from one
fixture. Reproduce device numbers by running the example app and tapping
**Run Benchmark**, and reproduce the isolated JS baseline with `bun run benchmark`.
Methodology and the full capability matrix:
**[Comparison & benchmarks](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/comparison.md)**.

## Security

- Parse input is bounded: the JavaScript boundary rejects documents above
  `options.maxInputLength` (default 10 MiB UTF-8 bytes) with a typed error, and the
  C++ parser enforces the same hard cap in bytes plus a 64 MB JSON output cap.
- Custom `onLinkPress` handlers receive the original href so apps can handle
  routes and custom schemes. The built-in `Linking` fallback opens only
  validated HTTP(S), mail, and telephone URLs. Remote images load by default
  for compatibility — set `imageOptions={{ remoteImages: "deny" }}` (and/or
  `allowedHosts`) when rendering untrusted markdown in privacy- or SSRF-sensitive
  apps.
- The C++ parser is fuzzed with a seeded, deterministic corpus and checked
  against a CommonMark/GFM conformance corpus in `bun run check`.

See [SECURITY.md](./SECURITY.md) for supported versions and how to report issues.

## API

The stable component, hook, headless, renderer, session, and TypeScript export
surface is documented in the [API reference](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/api-reference.md).

## Error Contract

Parser, extraction, session, and render failures use `MarkdownError` with stable
`code` and `source` fields. A supplied or transformed AST with cyclic
`children` fails with `code: "invalid_ast"` and `source: "render"`; return a new
tree instead of mutating or cyclically linking an AST. See the [API reference](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/api-reference.md#headless-exports)
for the error-code contract.

## Documentation

| Guide                                                                                                                  | What's inside                                              |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| [Installation](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/installation.md)          | Expo & bare RN setup, requirements, platforms.             |
| [Usage](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/usage.md)                        | `<Markdown>`, props, elements, virtualization, source AST. |
| [Streaming](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/streaming.md)                | Token-by-token LLM / chat rendering.                       |
| [Headless](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/headless.md)                  | Parse to AST, plain-text extraction.                       |
| [Customization](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/customization.md)        | Themes, dark mode, per-node styles, renderers, plugins.    |
| [Comparison & benchmarks](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/comparison.md) | Why Nitro, parse benchmarks, capability matrix.            |
| [API reference](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/api-reference.md)        | Full export and type listing.                              |
| [Security policy](./SECURITY.md)                                                                                       | Supported versions, link/image policy, reporting.          |
| [Changelog](./CHANGELOG.md)                                                                                            | Package changes and migration requirements by version.     |
| [Troubleshooting](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/troubleshooting.md)    | Common install and runtime issues.                         |

## Platform Support

| Dependency                                                                | Supported                                                                                           |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| [React Native](https://reactnative.dev/)                                  | `>=0.75` (New Architecture); runtime gate `0.86.2`, RN `0.87` Strict TypeScript compatibility check |
| [Nitro Modules](https://www.npmjs.com/package/react-native-nitro-modules) | `>=0.37.0 <0.38.0`                                                                                  |
| [RaTeX React Native](https://www.npmjs.com/package/ratex-react-native)    | `>=0.1.4` (example validated with `0.1.14`)                                                         |
| [Expo](https://docs.expo.dev/versions/v57.0.0/)                           | SDK `57.0.16` development builds with RN `0.86.2`                                                   |
| Platforms                                                                 | iOS, Android (Web not supported)                                                                    |

The native package gate and Expo example use React Native `0.86.2`. `check:ci`
also compiles the public source against React Native `0.87.0`'s Strict
TypeScript API. Do not override the React Native version selected by Expo.

Web and Expo Go are not supported runtime targets because the parser requires
Nitro Modules (JSI). See the [installation platform matrix](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/installation.md#platform-support).

### Upgrading from 0.11.x and earlier

Version `0.12.0` requires `react-native-nitro-modules` `>=0.37.0 <0.38.0`.
Upgrade that peer dependency before installing this package and rebuild native
projects. `options.maxInputLength` is measured in UTF-8 bytes, and session
ranges that split a UTF-16 surrogate pair now fail with `invalid_range`; use
code-point boundaries when calling `getTextRange()` or `replace()`. The
deprecated `onParsingInProgress` callback remains available, and ASTs are
mutable by default again. Use `options.freezeAst` for defensive immutability.

## Troubleshooting

For native-module, Expo, parser, streaming, and renderer failures, use the
[Troubleshooting guide](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/docs/troubleshooting.md).
Prebuild and rebuild after native dependency changes; a successful typecheck or
build does not prove runtime behavior.

## Development

```sh
bun install
bun run check
bun run check:ci
bun run release:preflight

bun run example:prebuild -- --platform android
bun run example:prebuild -- --platform ios
bun run example:android:assemble
bun run example:ios:build

bun run example:smoke
bun run example:smoke:android
bun run example:smoke:ios
```

`check` runs package lint, typecheck, tests, and C++ tests. `check:ci` adds
compatibility, harness, and React Native 0.87 type-compatibility checks; it does
not launch a native app. `release:preflight` adds example checks and an auth-free publish
dry-run; it does not publish or release the package. Prebuild generates native
projects, the Android/iOS build commands compile them, and smoke commands are
the runtime checks. Build and self-check success alone is not runtime proof.

## Contributing

```sh
bun install
bun run check          # lint + typecheck + tests
bun run example:ios    # run the example app
```

See [CONTRIBUTING.md](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/CONTRIBUTING.md). Run native example builds locally before release when changing native, Nitro, rendering, or packaging files. GitHub CI does not build the Android or iOS example.

## License

[MIT](./LICENSE)
