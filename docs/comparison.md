# Comparison & benchmarks

## Why Nitro Markdown

Most React Native Markdown libraries parse in **JavaScript** (markdown-it,
marked, commonmark) and render React components. Nitro Markdown moves parsing
into a **native C++ engine** (md4c, vendored as `nitromd`) over JSI, then renders
flexible React Native components on top. You get the parse speed of native with
the flexibility of components — plus first-class streaming and headless APIs.

- ⚡ **Native C++ parsing** — CommonMark + GFM, multiple times faster than JS parsers.
- 🔀 **Streaming** — purpose-built for token-by-token LLM / chat output ([streaming](./streaming.md)).
- 🧩 **Headless AST** — parse without rendering, for search/validation/indexing ([headless](./headless.md)).
- 🎨 **Real components** — theme, override per node, or swap whole renderers ([customization](./customization.md)).
- 📜 **Virtualization** — bounded memory and time-to-first-screen on long docs.
- 🧮 **Math + syntax highlighting + GFM tables** out of the box.

## Parse benchmark

Parsing the same ~320 KB Markdown document, measured in the example app's
**Bench** tab on an iOS Simulator (median of repeated runs; absolute numbers vary
by device, the ratios are stable):

| Parser | Time | vs Nitro |
| ------ | ---- | -------- |
| **Nitro (C++)** | **~41 ms** | — |
| CommonMark (JS) | ~113 ms | ~2.8× slower |
| Markdown-It (JS) | ~184 ms | ~4.5× slower |
| Marked (JS) | ~814 ms | ~19.8× slower |

Math rendering (via `ratex-react-native`) is ~10× faster than legacy MathJax/SVG
(~233 ms vs ~2517 ms in the same run). Reproduce any of this yourself: run the
example app and tap **Run Benchmark**.

## Capability matrix

Versus typical JS-parser Markdown renderers for React Native:

| Capability | Nitro Markdown | JS-parser renderers |
| ---------- | :------------: | :-----------------: |
| Native C++ parsing | ✅ | ❌ (JS thread) |
| GFM (tables, tasks, strikethrough) | ✅ | ⚠️ varies |
| Inline + block math | ✅ | ⚠️ varies |
| Streaming / incremental render | ✅ | ❌ |
| Headless AST + plain-text API | ✅ | ⚠️ varies |
| Per-node custom renderers | ✅ | ⚠️ varies |
| Theme + per-node style overrides | ✅ | ⚠️ varies |
| Long-doc virtualization | ✅ | ❌ |
| Plugin pipeline (before/after parse) | ✅ | ⚠️ varies |
| Syntax highlighting | ✅ | ⚠️ varies |

## Rendering performance

Nitro Markdown renders real components, so its render cost scales with the
document. It is heavily optimized — text-only blocks collapse to a single native
text node, and long documents virtualize so only the visible screen mounts. The
example **Bench** tab tracks Nitro's render and first-screen times directly.

## When to choose what

- **Chat / LLM / AI apps** → Nitro Markdown (streaming + native parse).
- **Long documents / feeds** → Nitro Markdown (virtualization).
- **Search / indexing / server-shared logic** → Nitro Markdown headless API.
