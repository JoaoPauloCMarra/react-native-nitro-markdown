# Comparison & benchmarks

## Why Nitro Markdown

Most React Native Markdown libraries parse in **JavaScript** (markdown-it,
marked, commonmark) and render React components. Nitro Markdown moves parsing
into a **native C++ engine** (md4c, vendored as `nitromd`) over JSI, then renders
flexible React Native components on top. You get a native parser boundary with
the flexibility of components — plus first-class streaming and headless APIs.

- ⚡ **Native C++ parsing** — CommonMark + GFM with a reproducible benchmark
  harness; measure on the device and build configuration you ship.
- 🔀 **Streaming** — purpose-built for token-by-token LLM / chat output ([streaming](./streaming.md)).
- 🧩 **Headless AST** — parse without rendering, for search/validation/indexing ([headless](./headless.md)).
- 🎨 **Real components** — theme, override per node, or swap whole renderers ([customization](./customization.md)).
- 📜 **Virtualization** — bounded memory and time-to-first-screen on long docs.
- 🧮 **Math + syntax highlighting + GFM tables** out of the box.

## Parse benchmark

The benchmark has separate records for separate runtimes. Nitro device timing
comes from the example app's **Bench** tab on an iPhone 17 iOS Simulator and a
Pixel 7 Android emulator. The app measures Nitro only; it does not run JS
baselines in the same React Native process.

| Nitro device path | iOS observed | Android observed |
| ----------------- | ------------ | ---------------- |
| **Offsets on**    | 71.3 ms p50 | 57.0 ms p50      |
| **Offsets off**   | 47.2 ms p50 | 37.6 ms p50      |

The JavaScript baseline runs separately with `bun run benchmark`. Each parser
gets a fresh Node process, and the command prints the package version, fixture
byte count, SHA-256, runtime, and p50/p95. The latest local baseline was on
macOS arm64 with Node v24.15 and the `node-complex-markdown-v1` fixture
(182,850 UTF-8 bytes):

| JavaScript baseline |      p50 |      p95 |
| ------------------- | -------: | -------: |
| CommonMark.js       |  5.15 ms |  9.20 ms |
| Markdown-It         |  8.59 ms | 11.91 ms |
| Marked              | 13.52 ms | 16.48 ms |

These Node and device records must not be converted into a cross-runtime speed
ratio. Absolute values vary by device, runtime, build, and workload; use the
same record type for regression decisions.

Math rendering via `ratex-react-native` measured 384 ms on iOS and 283 ms on
Android versus 2,533 ms and 2,910 ms respectively for legacy MathJax/SVG in
the same development runs. These measurements are not a promise of release
performance. Reproduce them on your target device by running the example app
and tapping **Run Benchmark**.

The parser-only result is intentionally separate from rendering. Disabling
offsets removes about 34% from Nitro's measured device parse round trip. The
default Nitro render path already selects the no-offset path when safe, avoids
public AST validation/cloning, coalesces plain-text runs, and supports native
streaming and virtualization.

## Capability matrix

Versus typical JS-parser Markdown renderers for React Native:

| Capability                           | Nitro Markdown | JS-parser renderers |
| ------------------------------------ | :------------: | :-----------------: |
| Native C++ parsing                   |       ✅       |   ❌ (JS thread)    |
| GFM (tables, tasks, strikethrough)   |       ✅       |      ⚠️ varies      |
| Inline + block math                  |       ✅       |      ⚠️ varies      |
| Streaming / incremental render       |       ✅       |         ❌          |
| Headless AST + plain-text API        |       ✅       |      ⚠️ varies      |
| Per-node custom renderers            |       ✅       |      ⚠️ varies      |
| Theme + per-node style overrides     |       ✅       |      ⚠️ varies      |
| Long-doc virtualization              |       ✅       |         ❌          |
| Plugin pipeline (before/after parse) |       ✅       |      ⚠️ varies      |
| Syntax highlighting                  |       ✅       |      ⚠️ varies      |

## Rendering performance

Nitro Markdown renders real components, so its render cost scales with the
document. The default string path keeps the native AST internal, plain inline
runs collapse to fewer native `Text` nodes, and long documents virtualize so
only the visible screen mounts. On the same development fixtures,
mount-to-layout measured 217.24 ms for the rich iOS document, 150.50 ms for its
virtualized first screen, 291.20 ms for rich Android, and 168.69 ms for its
virtualized first screen. These are target and workload measurements, not
release-performance guarantees. The example **Bench** tab tracks Nitro's
render and first-screen times directly.

## When to choose what

- **Chat / LLM / AI apps** → Nitro Markdown (streaming + native parse).
- **Long documents / feeds** → Nitro Markdown (virtualization).
- **Native search / indexing pipelines** → Nitro Markdown headless API.
