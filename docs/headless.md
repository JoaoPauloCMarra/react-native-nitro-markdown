# Headless parsing

Use the `react-native-nitro-markdown/headless` export when you need AST data,
plain-text extraction, indexing, validation, or tests **without rendering UI**.
It pulls in the native parser only — no React components.

```ts
import {
  parseMarkdown,
  parseMarkdownWithOptions,
  extractPlainText,
  extractPlainTextWithOptions,
} from "react-native-nitro-markdown/headless";

const ast = parseMarkdown("# Title");
const astWithMath = parseMarkdownWithOptions("Inline $x^2$", { math: true });
const text = extractPlainText("Hello **world**"); // "Hello world"
const gfmText = extractPlainTextWithOptions("| A |\n|---|\n| B |", { gfm: true });

// Search / indexing — skip source offsets natively for a smaller, faster AST.
const lean = parseMarkdownWithOptions(doc, { sourceOffsets: false });
```

`parseMarkdown`, `parseMarkdownWithOptions`, `extractPlainText`, and
`extractPlainTextWithOptions` throw typed `MarkdownError`s (stable `code` and
`source` fields) when the Nitro module is unavailable, native parsing fails, or
native output is invalid JSON. Catch these errors at your application boundary.
The headless entry removes React rendering, but still requires the package's
native iOS or Android runtime; it does not run on Node.js, servers, or web.

> **Input bounds.** Inputs larger than `options.maxInputLength` (default
> 10,000,000 characters) are rejected with a typed `input_too_large` error
> before any native call. The native parser enforces the same hard cap in
> bytes, plus a 64 MB JSON output cap.

> **Extraction policy.** `extractPlainText*` never silently falls back to
> JavaScript flattening. Native extraction failures throw a typed
> `MarkdownError` (`extraction_failed`); if you want JS-side flattening, parse
> explicitly and call `getFlattenedText` yourself.

> **Tip:** for one-shot parses that never map a node back to the source text,
> pass `{ sourceOffsets: false }`. The native parser skips building the UTF-16
> offset map entirely, omits the `beg`/`end` fields, and shrinks the JSON
> crossing JSI and the work `JSON.parse` does — and it is cheaper than
> `stripSourceOffsets`, which only removes them *after* the full tree has been
> serialized and parsed. Keep the default for streaming/incremental rendering,
> which relies on offsets to reuse nodes. Enabled offsets are JavaScript UTF-16
> indices and can be passed directly to `String.slice`, including for accented
> text and emoji.
>
> Measured in the example app on a ~53 KB document: the AST JSON is **~39 %
> smaller** and the full native-parse → JSI → `JSON.parse` round trip is **~35 %
> faster** with `sourceOffsets: false`. (Absolute numbers vary by device and
> document; the savings scale with node count. Reproduce with
> `scripts/benchmark-node.js` / the example benchmark screen.)

## API

| Function | Returns | Description |
| -------- | ------- | ----------- |
| `parseMarkdown(text)` | `MarkdownNode` | Parse with default options. |
| `parseMarkdownWithOptions(text, options)` | `MarkdownNode` | Parse with explicit `ParserOptions`. |
| `extractPlainText(text)` | `string` | Strip Markdown to plain text. |
| `extractPlainTextWithOptions(text, options)` | `string` | Plain text with explicit options. |

### AST helpers

| Helper | Description |
| ------ | ----------- |
| `getTextContent(node)` | Concatenated text of a node. |
| `getFlattenedText(node)` | Flattened text of an entire tree. |
| `stripSourceOffsets(node)` | Remove `beg`/`end` source offsets (smaller payloads, stable snapshots). |

## The AST

`parseMarkdown` returns a `MarkdownNode` tree. Each node has a `type`, optional
`children`, and type-specific fields (`content`, `level`, `href`, `language`,
`ordered`, `checked`, …):

```ts
{
  type: "document",
  children: [
    { type: "heading", level: 1, children: [{ type: "text", content: "Title" }] },
  ],
}
```

## Why headless?

- **Search / indexing** — extract plain text for full-text search.
- **Validation** — assert document structure in tests without a renderer.
- **Shared application logic** — the same AST shape can drive native and custom UIs.
- **Pre-parsing** — parse once, then pass the result to `<Markdown sourceAst>`
  (see [Usage](./usage.md#source-ast-rendering)) to skip parsing on render.

## See also

- [Usage](./usage.md) — render an AST with `<Markdown sourceAst>`.
- [API reference](./api-reference.md) — full type listing.
