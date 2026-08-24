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
| `minimalMarkdownTheme` | Near-unstyled baseline you fully control (also `stylingStrategy="minimal"`). |

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

For stronger typing, use the node-specific renderer props:

```tsx
import type { CodeBlockRendererProps } from "react-native-nitro-markdown";

function CodeBlock({ content, language }: CodeBlockRendererProps) {
  return <Text>{`${language ?? "text"}: ${content}`}</Text>;
}
```

For `html_inline` and `html_block`, read `node.content` directly.

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
`onError` receives `(error, phase, pluginName?)` for parser and plugin failures.

> A `beforeParse` plugin forces a full parse, which disables incremental AST
> reuse during [streaming](./streaming.md).

## Syntax highlighting

```tsx
<Markdown highlightCode>{codeMarkdown}</Markdown>
```

Pass `highlightCode={true}` for the built-in tokenizer, or a custom
`CodeHighlighter` function for your own theme/grammar.

## See also

- [Usage](./usage.md) — props and options.
- [API reference](./api-reference.md) — `MarkdownTheme`, renderer prop types.
