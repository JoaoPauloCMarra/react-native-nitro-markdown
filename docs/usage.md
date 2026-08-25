# Usage

The `<Markdown>` component parses a Markdown string in native C++ and renders it
as real React Native views — every block is a normal component you can theme,
override, or virtualize.

```tsx
import { Markdown } from "react-native-nitro-markdown";

export function Article() {
  return (
    <Markdown options={{ gfm: true, math: true }}>
      {"# Hello\nThis is **native** markdown."}
    </Markdown>
  );
}
```

## Supported elements

CommonMark plus GitHub Flavored Markdown:

- Headings (`#`–`######`), paragraphs, soft/hard line breaks
- **Bold**, _italic_, ~~strikethrough~~, `inline code`
- Links and images (with caching)
- Blockquotes, ordered / unordered / nested lists, task lists
- Fenced code blocks (with optional syntax highlighting)
- GFM tables with column alignment, horizontal scroll, and a copy menu
- Inline `$math$` and block `$$math$$` (via `ratex-react-native`)
- Thematic breaks (`---`)
- Raw HTML nodes (opt-in via `options.html`) for custom renderers

## Common props & options

| Prop / option            | Default     | Description                                                                                                                                     |
| ------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `options.gfm`            | `true`      | Tables, strikethrough, task lists, autolinks.                                                                                                   |
| `options.math`           | `true`      | Parse inline and block math nodes.                                                                                                              |
| `options.html`           | `false`     | Preserve raw HTML nodes for custom renderers.                                                                                                   |
| `options.sourceOffsets`  | `true`      | Optional source mapping. `true` emits `beg`/`end` as JavaScript UTF-16 indices; `false` omits them and skips the native offset map. Keep it omitted (or set `true`) when your code needs source ranges; set `false` for lean one-shot rendering. The ordinary string render fast path selects `false` automatically when safe. |
| `options.maxInputLength` | `10485760`  | Maximum accepted input in UTF-8 bytes.                                                                                                          |
| `options.freezeAst`      | `false`     | Freeze AST nodes and child arrays before callbacks and rendering.                                                                               |
| `parseCache`             | `true`      | Reuse parsed ASTs for repeated content (set `false` to force re-parse).                                                                         |
| `sourceAst`              | `undefined` | Render a pre-parsed AST instead of parsing `children`.                                                                                          |
| `highlightCode`          | `false`     | Enable built-in code syntax highlighting (or pass a custom highlighter).                                                                        |
| `theme`                  | opinionated | Theme tokens — see [Customization](./customization.md).                                                                                         |
| `styles`                 | `undefined` | Per-node-type style overrides.                                                                                                                  |
| `renderers`              | `undefined` | Custom component per node type — see [Customization](./customization.md).                                                                       |
| `virtualize`             | `false`     | Virtualize top-level blocks for very long documents (`true` / `"auto"`).                                                                        |
| `tableOptions`           | defaults    | Table measurement and minimum column widths.                                                                                                    |
| `onLinkPress`            | open URL    | Intercept link taps; return `false` to prevent the default.                                                                                     |
| `onParsingInProgress`    | —           | Deprecated compatibility callback invoked after the current parse render commits. Use `onParseComplete` or `MarkdownStream` state for new code. |
| `onError`                | —           | `(error, phase, pluginName?)` for parser/plugin failures.                                                                                       |

`parseCache` keeps an internal AST cache per `<Markdown>` instance keyed by
content + parser options, so re-rendering the same Markdown avoids re-parsing.
The cache is bounded (32 entries) and per-instance hit/miss/eviction counters
are reported through `onParseComplete`'s `cacheStats`.

AST nodes are mutable by default, and plugin/transform inputs are isolated from
the parser cache. Set `options.freezeAst` to freeze nodes and child arrays
before they reach renderers or callbacks.

`sourceOffsets` is optional. The public parser keeps the compatibility default
`true` because existing consumers may use `beg`/`end` for diagnostics, source
maps, annotations, editor selection, or incremental AST reuse. A literal
`{ sourceOffsets: false }` option returns a TypeScript node type without those
fields and is the recommended choice for one-shot headless work that does not
need source mapping.

Native parse failures do not produce an empty document. `<Markdown>` renders
the `errorText` (localizable) and calls `onError(error, "parse")`. Plugin
failures use the `"before-plugin"` or `"after-plugin"` phase and include the
plugin name when available.

## Long documents (virtualization)

For very long documents, virtualize the top-level blocks so only the visible
screen mounts. This keeps time-to-first-screen and memory bounded:

```tsx
<Markdown
  virtualize="auto"
  virtualizationMinBlocks={40}
  virtualization={{ initialNumToRender: 10, windowSize: 7 }}
>
  {longDocument}
</Markdown>
```

Use `virtualize` when `<Markdown>` is the primary scroll container on screen.

## Source AST rendering

If you already have a `MarkdownNode` (e.g. cached, or from
[headless parsing](./headless.md)), pass it via `sourceAst` to skip native
parsing during render:

```tsx
import {
  Markdown,
  parseMarkdown,
  type MarkdownNode,
} from "react-native-nitro-markdown";

const ast: MarkdownNode = parseMarkdown("# Cached AST", { gfm: true });

<Markdown sourceAst={ast}>{"# Cached AST"}</Markdown>;
```

When `sourceAst` is provided, `beforeParse` plugins are skipped because parsing
already happened. `afterParse` plugins and `astTransform` still run.

## Link handling

```tsx
import { Linking } from "react-native";

<Markdown
  onLinkPress={(href) => {
    Linking.openURL(href);
    return false;
  }}
>
  {"[Docs](https://reactnative.dev)"}
</Markdown>;
```

Return `false` from `onLinkPress` to suppress the default open-URL behavior.

## See also

- [Customization](./customization.md) — themes, per-node styles, custom renderers, plugins.
- [Streaming](./streaming.md) — incremental rendering for chat/LLM output.
- [API reference](./api-reference.md) — full prop and type listing.
