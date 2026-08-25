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

Parsing the same ~320 KB Markdown document, measured in the example app's
**Bench** tab on the iPhone 17 iOS Simulator in a development build. Absolute
numbers vary by device, build, and workload; use the example benchmark for a
release decision.

| Parser           | Time   |
| ---------------- | ------ |
| **Nitro (C++)**  | ~242 ms |
| CommonMark (JS)  | ~117 ms |
| Markdown-It (JS) | ~191 ms |
| Marked (JS)      | ~1,036 ms |

Math rendering via `ratex-react-native` measured ~350 ms versus ~1,216 ms for
legacy MathJax/SVG in the same development run. These measurements are not a
promise of release performance. Reproduce them on your target device by running
the example app and tapping **Run Benchmark**.

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
document. It is heavily optimized — text-only blocks collapse to a single native
text node, and long documents virtualize so only the visible screen mounts. The
example **Bench** tab tracks Nitro's render and first-screen times directly.

## When to choose what

- **Chat / LLM / AI apps** → Nitro Markdown (streaming + native parse).
- **Long documents / feeds** → Nitro Markdown (virtualization).
- **Native search / indexing pipelines** → Nitro Markdown headless API.
