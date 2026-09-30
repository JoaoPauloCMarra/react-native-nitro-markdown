# API reference

Three entry points:

- `react-native-nitro-markdown` — components, hooks, theme, renderers, types.
- `react-native-nitro-markdown/headless` — parser-only (no React), see [headless](./headless.md).
- `react-native-nitro-markdown/math` — RaTeX math renderers. Requires the
  optional peer `ratex-react-native` (React Native `>=0.84`). See
  [installation](./installation.md#math-rendering-optional).

## Components

| Export                                                                                                                                                                             | Description                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `Markdown`                                                                                                                                                                         | Render a complete Markdown string. See [usage](./usage.md).      |
| `MarkdownStream`                                                                                                                                                                   | Incremental / streaming render. See [streaming](./streaming.md). |
| `Heading`, `Paragraph`, `Link`, `Blockquote`, `HorizontalRule`, `CodeBlock`, `InlineCode`, `List`, `ListItem`, `TaskListItem`, `TableRenderer`, `Image`, `HtmlBlock`, `HtmlInline`, `MathInline`, `MathBlock` | Individual renderer components (compose your own tree). `MathInline` / `MathBlock` from the main entry render monospace text. |

## Math subpath (`react-native-nitro-markdown/math`)

| Export                              | Description                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `mathRenderers`                     | `math_inline` / `math_block` renderers that draw LaTeX with RaTeX. Pass as `renderers`, or spread into your own renderers. |
| `RaTeXMathInline`, `RaTeXMathBlock` | RaTeX-backed math components (`content`, `style`) for custom trees.                                  |
| `RaTeXMathProps`                    | Props type for the two components.                                                                   |
| `LatexViewComponent`, `LatexViewProps` | Shape of the LaTeX view the math components accept.                                               |

### `MarkdownProps` (selected)

`children` (string), `options` (`ParserOptions`), `plugins`, `sourceAst`,
`parseCache`, `astTransform`, `renderers`, `theme`, `styles`, `stylingStrategy`,
`style`, `onLinkPress`, `onParseComplete`, `onError`, `virtualize`,
`virtualizationMinBlocks`, `virtualization`, `tableOptions`, `imageOptions`,
`highlightCode`, `errorText`. Full prop table in [usage](./usage.md#common-props--options).

### `MarkdownStream` options (selected)

`updateStrategy`, `updateIntervalMs`, `useTransitionUpdates`,
`incrementalParsing`, `initialParseMode` (`"sync"` default or `"async"` for
large initial content), `options`, `plugins`, `onError`, `renderMarkdown`.

## Hooks & sessions

| Export                                     | Description                                                                                                                                                                                                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useMarkdownSession(initialText?)`         | Owns a streaming session. Returns `getSession()`, `reset(text)`, `replace(from, to, text)`, `clear()`, `setHighlight(position)`, `stop()`, `isStreaming` and `setIsStreaming`. Append tokens with `getSession().append(chunk)`. Safe under React StrictMode and Fast Refresh. |
| `useMarkdownStreamState(options)`          | Headless streaming text + source AST state.                                                                                                                                                                                                                                     |
| `useStream()`                              | Timestamped stream state.                                                                                                                                                                                                                                                       |
| `createMarkdownSession()`                  | Imperative session outside React. Session failures throw typed `MarkdownError`s with `source: "session"`. `getTextRange` and `replace` use `[from, to)` JavaScript UTF-16 units; an index inside a surrogate pair (including emoji) throws `invalid_range` instead of rounding. |
| `useMarkdownContext()` / `MarkdownContext` | Access theme/renderers within custom renderers.                                                                                                                                                                                                                                 |

## Theme

| Export                       | Description                               |
| ---------------------------- | ----------------------------------------- |
| `defaultMarkdownTheme`       | Opinionated default (light) theme tokens. |
| `darkMarkdownTheme`          | Ready-made dark theme preset.             |
| `minimalMarkdownTheme`       | Near-unstyled baseline.                   |
| `mergeThemes(base, partial)` | Merge a partial theme over a base.        |

## Headless exports

`parseMarkdown`, `parseMarkdownWithOptions`, `parseMarkdownSession`,
`extractPlainText`, `extractPlainTextWithOptions`, `getTextContent`,
`getFlattenedText`, `stripSourceOffsets`, `MarkdownParserModule`,
`MarkdownError`, `MAX_PARSE_INPUT_LENGTH`. See [headless](./headless.md).

`parseMarkdown` and `parseMarkdownWithOptions` throw when native parsing cannot
produce a complete valid AST. Failures are typed `MarkdownError`s with a stable
`code` and `source`. `<Markdown>` and `<MarkdownStream>` surface the same
failures through `onError(error, "parse")`.

| `code`               | When                                                                                                                                                              |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `input_too_large`    | Input is larger than `options.maxInputLength` (default 10,485,760 UTF-8 bytes), or `maxInputLength` itself is not a finite non-negative integer.                  |
| `input_too_complex`  | Input is within the size cap but exceeds a native parser budget: 100,000 AST nodes, 250,000 child slots, 500,000 units of AST work, 64 MiB of AST JSON, or 64 MiB of flattened text. For example, about 650 KB of short paragraphs can reach the node budget. Split the document or render it in parts. |
| `invalid_ast`        | AST depth exceeds 256 levels, or a supplied or transformed AST is cyclic (`source: "render"`).                                                                     |
| `invalid_json`       | Native output was not valid AST JSON.                                                                                                                             |
| `parse_failed`       | Any other native parse failure.                                                                                                                                   |
| `native_unavailable` | The native module is not linked (Expo Go, web, or a stale native build).                                                                                         |
| `buffer_limit`       | A session write would grow the buffer above 10,485,760 UTF-8 bytes.                                                                                               |
| `invalid_range`      | A session range is not finite, is reversed, or splits a UTF-16 surrogate pair.                                                                                    |
| `destroyed`          | A session was used after `dispose()`.                                                                                                                             |
| `extraction_failed`  | Reserved. Not produced in this release: plain-text extraction falls back to JavaScript flattening (see [headless](./headless.md)).                                |

`source` is `parse`, `session` or `render`. `"extract"` is reserved and is not
produced in this release.
Parser text nodes preserve verbatim entity text such as `&amp;`; entity text is
not decoded before it reaches the AST or renderer.

`invalid_ast` has `source: "render"` and is reported when a supplied `sourceAst`
or an AST returned by `afterParse`/`astTransform` contains a cycle in its
`children`. Shared child nodes (a DAG) are valid; cyclic trees are rejected
before rendering so the renderer never recurses forever.

## `ParserOptions`

```ts
type ParserOptions = {
  gfm?: boolean; // default true — tables, strikethrough, task lists, autolinks
  math?: boolean; // default true — inline $..$ and block $$..$$
  html?: boolean; // default false — keep raw HTML nodes
  sourceOffsets?: boolean; // default true — false omits beg/end and skips the UTF-16 map
  maxInputLength?: number; // default 10,485,760 — maximum input length in UTF-8 bytes
  freezeAst?: boolean; // default false — freeze returned nodes and child arrays
};
```

Set `sourceOffsets: false` for one-shot headless parses (search, indexing,
validation) where you never map a node back to the source text. The native
parser then skips building the UTF-16 offset map and omits the `beg`/`end`
fields entirely, so the JSON crossing JSI is smaller and `JSON.parse` does less
work — cheaper than the post-hoc `stripSourceOffsets` helper, which walks and
rebuilds the tree after the cost is paid. Keep the default (`true`) for
streaming/incremental rendering, which uses offsets to reuse stable nodes
between reparses. Enabled offsets match JavaScript `String.length` and
`String.slice`, including for accented text and emoji.

The public TypeScript overloads reflect literal options: the no-options parser
returns `MarkdownNodeWithSourceOffsets`, while a literal
`{ sourceOffsets: false }` returns `MarkdownNodeWithoutSourceOffsets`. A broad
`ParserOptions` variable keeps the safe optional `beg`/`end` shape because its
runtime value may be either setting.

`freezeAst` is an additive defensive option. The default AST is mutable for
compatibility with earlier releases; component and cache boundaries still clone
trees so mutation of one consumer result cannot poison another cached result.

## Key types

`MarkdownNode`, `MarkdownNodeWithSourceOffsets`, `MarkdownNodeWithoutSourceOffsets`,
`MarkdownNodeType`, `HeadingLevel`, `TableCellAlign`,
`ParserOptions`, `MarkdownParser`, `MarkdownProps`, `AstTransform`,
`MarkdownPlugin`, `MarkdownErrorPhase`, `MarkdownParseCompleteResult`,
`ParseCacheStats`, `MarkdownVirtualizationOptions`, `CustomRenderers`,
`MarkdownRenderers`, `CustomRenderer`, `CustomRendererPropsByNode`,
`NodeRendererProps`, `HeadingRendererProps`, `LinkRendererProps`,
`ImageRendererProps`, `CodeBlockRendererProps`, `InlineCodeRendererProps`,
`ListRendererProps`, `TaskListItemRendererProps`, `MathRendererProps`,
`LinkPressHandler`, `MarkdownTheme`, `PartialMarkdownTheme`,
`NodeStyleOverrides`, `StylingStrategy`, `TableOptions`, `MarkdownSession`,
`MarkdownSessionController`, `MarkdownStreamProps`,
`MarkdownStreamRenderProps`, `MarkdownStreamState`,
`MarkdownStreamSourceAstStatus`, `MarkdownStreamSourceAstDisabledReason`,
`UseMarkdownStreamStateOptions`, `CodeHighlighter`, `HighlightedToken`,
`TokenType`, `UrlSafetyOptions`, `MarkdownError`, `MarkdownErrorCode`,
`MarkdownErrorSource`, `BaseCustomRendererProps`, `EnhancedRendererProps`,
`MarkdownContextValue`, `CustomRendererProps`.

Values: `defaultHighlighter`, `SUPPORTED_HIGHLIGHT_LANGUAGES`,
`MAX_PARSE_INPUT_LENGTH`.

> Prefer importing these types over local object shapes so editors and AI tools
> catch invalid parser options, node names, renderer props, and session usage.

`MarkdownNode` values are mutable by default for compatibility. Pass
`freezeAst: true` when defensive immutability is required. A `sourceAst` must
be acyclic; cyclic trees are rejected before rendering. Plugins and transforms
receive isolated trees, so they may mutate their input in the default mode or
return a new tree.
