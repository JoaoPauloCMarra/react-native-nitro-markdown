# API reference

Two entry points:

- `react-native-nitro-markdown` — components, hooks, theme, renderers, types.
- `react-native-nitro-markdown/headless` — parser-only (no React), see [headless](./headless.md).

## Components

| Export | Description |
| ------ | ----------- |
| `Markdown` | Render a complete Markdown string. See [usage](./usage.md). |
| `MarkdownStream` | Incremental / streaming render. See [streaming](./streaming.md). |
| `Heading`, `Paragraph`, `Link`, `Blockquote`, `HorizontalRule`, `CodeBlock`, `InlineCode`, `List`, `ListItem`, `TaskListItem`, `TableRenderer`, `Image`, `MathInline`, `MathBlock` | Individual renderer components (compose your own tree). |

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

| Export | Description |
| ------ | ----------- |
| `useMarkdownSession()` | Owns a streaming session; `reset` / `append` / `getSession()`. |
| `useMarkdownStreamState(options)` | Headless streaming text + source AST state. |
| `useStream()` | Timestamped stream state. |
| `createMarkdownSession()` | Imperative session outside React. Session failures throw typed `MarkdownError`s with `source: "session"`. |
| `useMarkdownContext()` / `MarkdownContext` | Access theme/renderers within custom renderers. |

## Theme

| Export | Description |
| ------ | ----------- |
| `defaultMarkdownTheme` | Opinionated default (light) theme tokens. |
| `darkMarkdownTheme` | Ready-made dark theme preset. |
| `minimalMarkdownTheme` | Near-unstyled baseline. |
| `mergeThemes(base, partial)` | Merge a partial theme over a base. |

## Headless exports

`parseMarkdown`, `parseMarkdownWithOptions`, `extractPlainText`,
`extractPlainTextWithOptions`, `getTextContent`, `getFlattenedText`,
`stripSourceOffsets`. See [headless](./headless.md).

`parseMarkdown` and `parseMarkdownWithOptions` throw when native parsing cannot
produce a complete valid AST. Failures are typed `MarkdownError`s with stable
`code` (`input_too_large`, `parse_failed`, `invalid_json`, `native_unavailable`,
`extraction_failed`, `buffer_limit`, `invalid_range`, `destroyed`) and
`source` (`parse` | `extract` | `session` | `render`). `<Markdown>` and
`<MarkdownStream>` surface the same failures through `onError(error, "parse")`.

## `ParserOptions`

```ts
type ParserOptions = {
  gfm?: boolean;           // default true — tables, strikethrough, task lists, autolinks
  math?: boolean;          // default true — inline $..$ and block $$..$$
  html?: boolean;          // default false — keep raw HTML nodes
  sourceOffsets?: boolean; // default true — emit beg/end JavaScript UTF-16 indices
  maxInputLength?: number; // default 10,000,000 — maximum input length in characters
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

## Key types

`MarkdownNode`, `MarkdownNodeType`, `HeadingLevel`, `TableCellAlign`,
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
`MarkdownErrorSource`, `SUPPORTED_HIGHLIGHT_LANGUAGES`.

> Prefer importing these types over local object shapes so editors and AI tools
> catch invalid parser options, node names, renderer props, and session usage.
