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

| Prop / option | Default | Description |
| ------------- | ------- | ----------- |
| `options.gfm` | `true` | Tables, strikethrough, task lists, autolinks. |
| `options.math` | `true` | Parse inline and block math nodes. |
| `options.html` | `false` | Preserve raw HTML nodes for custom renderers. |
| `parseCache` | `true` | Reuse parsed ASTs for repeated content (set `false` to force re-parse). |
| `sourceAst` | `undefined` | Render a pre-parsed AST instead of parsing `children`. |
| `highlightCode` | `false` | Enable built-in code syntax highlighting (or pass a custom highlighter). |
| `theme` | opinionated | Theme tokens — see [Customization](./customization.md). |
| `styles` | `undefined` | Per-node-type style overrides. |
| `renderers` | `undefined` | Custom component per node type — see [Customization](./customization.md). |
| `virtualize` | `false` | Virtualize top-level blocks for very long documents (`true` / `"auto"`). |
| `tableOptions` | defaults | Table measurement and minimum column widths. |
| `onLinkPress` | open URL | Intercept link taps; return `false` to prevent the default. |
| `onError` | — | `(error, phase, pluginName?)` for parser/plugin failures. |

`parseCache` keeps an internal AST cache keyed by content + parser options, so
re-rendering the same Markdown avoids re-parsing.

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
import { Markdown, parseMarkdown, type MarkdownNode } from "react-native-nitro-markdown";

const ast: MarkdownNode = parseMarkdown("# Cached AST", { gfm: true });

<Markdown sourceAst={ast}>{"# Cached AST"}</Markdown>;
```

When `sourceAst` is provided, `beforeParse` plugins are skipped because parsing
already happened. `afterParse` plugins and `astTransform` still run.

## Link handling

```tsx
import { Linking } from "react-native";

<Markdown onLinkPress={(href) => { Linking.openURL(href); return false; }}>
  {"[Docs](https://reactnative.dev)"}
</Markdown>;
```

Return `false` from `onLinkPress` to suppress the default open-URL behavior.

## See also

- [Customization](./customization.md) — themes, per-node styles, custom renderers, plugins.
- [Streaming](./streaming.md) — incremental rendering for chat/LLM output.
- [API reference](./api-reference.md) — full prop and type listing.
