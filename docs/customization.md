# Customization

Because Nitro Markdown renders real React Native components, you can theme it,
override individual node styles, swap entire renderers, or transform the AST
through a plugin pipeline.

## Themes

Pass a partial theme to override tokens (colors, spacing, font sizes, families):

```tsx
import { Markdown, defaultMarkdownTheme } from "react-native-nitro-markdown";

<Markdown
  theme={{
    colors: { link: "#0ea5e9", heading: "#0b1424" },
    fontSizes: { h1: 30 },
  }}
>
  {content}
</Markdown>;
```

### Dark mode

Ship the built-in `darkMarkdownTheme` preset (a slate palette with dark-friendly
syntax tokens) — pass it straight to `theme`:

```tsx
import { useColorScheme } from "react-native";
import { Markdown, darkMarkdownTheme } from "react-native-nitro-markdown";

const scheme = useColorScheme();

<Markdown theme={scheme === "dark" ? darkMarkdownTheme : undefined}>
  {content}
</Markdown>;
```

Theme values always win over the built-in defaults, so you can also start from
a preset and tweak it with `mergeThemes(darkMarkdownTheme, { colors: { link: "#7dd3fc" } })`,
or pass a bare partial (`{ colors: { text: "#e5e7eb" } }`) for a one-off override.

### Theme presets

| Preset                 | Use for                                                                      |
| ---------------------- | ---------------------------------------------------------------------------- |
| `defaultMarkdownTheme` | Opinionated light defaults (the baseline).                                   |
| `darkMarkdownTheme`    | Ready-made dark palette.                                                     |
| `minimalMarkdownTheme` | Near-unstyled baseline you fully control. |

`stylingStrategy="minimal"` uses `minimalMarkdownTheme` as the base.
`theme={minimalMarkdownTheme}` is different: it merges over the default theme,
so values the minimal theme does not set (such as `codeTokenColors`) keep their
default values.

## Per-node style overrides

`styles` applies after internal styles, for fine-grained tweaks without
replacing a renderer:

```tsx
<Markdown
  styles={{ heading: { color: "red" }, code_block: { borderRadius: 0 } }}
>
  {content}
</Markdown>
```

`line_break` and `soft_break` render as plain text and cannot carry a style, so
their keys have no effect. Table styles apply to the matching table part:
`table_head` and `table_body` wrap the header and body rows, `table_row` styles
each row, and `table_cell` styles each cell container.

## Custom renderers

Replace the component used for any node type. Renderers receive parsed nodes
plus pre-mapped props:

```tsx
import { Text } from "react-native";
import { Markdown, type MarkdownRenderers } from "react-native-nitro-markdown";

const renderers: MarkdownRenderers = {
  paragraph({ children }) {
    return <Text style={{ lineHeight: 22 }}>{children}</Text>;
  },
};

<Markdown renderers={renderers}>{"Custom paragraph renderer"}</Markdown>;
```

Table parts are honoured as well. `table_cell` replaces the cell content inside
the sized cell. `table_head`, `table_body` and `table_row` receive the default
layout element as `children`, and the renderer must render `children`: a
renderer that returns something else replaces the whole header, body or row,
and the cells inside it are not drawn. Return `undefined` to keep the default.
A custom `table_cell` renderer runs twice per cell: once for display and once
in the off-screen pass that measures column widths, so it must not have side
effects that assume a single call. The measured width includes whatever the
renderer returns. A custom `table_cell` receives no table text style: style the
returned elements yourself, or read `theme.colors.tableHeaderText` and
`theme.colors.text` from your theme.
These three node types are drawn only by the table layout, so a standalone
`table_head`, `table_body` or `table_row` node renders nothing.

For stronger typing, use the node-specific renderer props:

```tsx
import type { CodeBlockRendererProps } from "react-native-nitro-markdown";

function CodeBlock({ content, language }: CodeBlockRendererProps) {
  return <Text>{`${language ?? "text"}: ${content}`}</Text>;
}
```

For `html_inline` and `html_block`, read `node.content` directly.

To draw math with RaTeX, spread `mathRenderers` from the optional `/math`
subpath into your renderers (see [installation](./installation.md#math-rendering-optional)):

```tsx
import { mathRenderers } from "react-native-nitro-markdown/math";

const renderers = { ...mathRenderers, blockquote: MyCallout };
```

## Plugin pipeline

Plugins preprocess source text (`beforeParse`) and/or post-process the AST
(`afterParse`):

```ts
import type { MarkdownPlugin } from "react-native-nitro-markdown";

const plugins: MarkdownPlugin[] = [
  {
    name: "mentions",
    priority: 10,
    beforeParse(source) {
      return source.replaceAll("@team", "**@team**");
    },
  },
];
```

Pipeline order: `beforeParse` plugins → parse (or `sourceAst`) → `afterParse`
plugins → `astTransform` → render. Higher `priority` runs first (stable sort).
`onError` receives `(error, phase, pluginName?)` for parser, plugin, `astTransform`
and `highlightCode` failures. `phase` is `"parse"`, `"before-plugin"`,
`"after-plugin"` or `"transform"`; a throwing `astTransform` keeps the parsed AST and
a throwing `highlightCode` renders the code block as plain text.

> A `beforeParse` plugin forces a full parse, which disables incremental AST
> reuse during [streaming](./streaming.md).

## Syntax highlighting

```tsx
<Markdown highlightCode>{codeMarkdown}</Markdown>
```

Pass `highlightCode={true}` for the built-in tokenizer, or a custom
`CodeHighlighter` function for your own theme/grammar. Token colors come from
`theme.colors.codeTokenColors`. The default (light) and dark themes ship
palettes with at least 4.5:1 contrast against their `codeBackground`.

## See also

- [Usage](./usage.md) — props and options.
- [API reference](./api-reference.md) — `MarkdownTheme`, renderer prop types.
