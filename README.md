<p align="center">
  <img src="./readme/demo.gif" alt="react-native-nitro-markdown demo" width="300" />
  <img src="./readme/stream-demo.gif" alt="react-native-nitro-markdown stream demo" width="300" />
</p>

# react-native-nitro-markdown

Fast, native Markdown parsing and rendering for React Native. Built on md4c (C++) and Nitro Modules (JSI), it turns Markdown into a typed AST synchronously and renders it with a batteries-included React Native renderer.

---

## Why this package exists

JavaScript Markdown parsers do a lot of work on the JS thread and often trigger GC pauses on large documents. This package moves parsing to native C++ and uses JSI to return the AST without going through the RN bridge.

**How it works:**

Markdown string -> md4c C++ parser -> JSON AST -> React Native renderers

---

## Features

- Native C++ parser with JSI access (fast, synchronous parsing)
- Full renderer included (Markdown component)
- Headless API for custom renderers or processing
- GFM support (tables, strikethrough, task lists, autolinks)
- LaTeX math parsing (inline and block)
- Streaming support for token-by-token updates
- Theming and per-node style overrides
- Built-in renderers exposed for reuse

---

## Requirements

- React Native >= 0.75
- react-native-nitro-modules

Optional (for math rendering):

- react-native-mathjax-svg
- react-native-svg

---

## Installation

Install the package and Nitro Modules:

```bash
bun add react-native-nitro-markdown react-native-nitro-modules
```

Optional math dependencies:

```bash
bun add react-native-mathjax-svg react-native-svg
```

iOS pods:

```bash
cd ios && pod install
```

Expo (requires a development build):

```bash
bunx expo install react-native-nitro-markdown react-native-nitro-modules
bunx expo prebuild
```

---

## Quick Start

```tsx
import { Markdown } from "react-native-nitro-markdown";

export function MyComponent() {
  return (
    <Markdown options={{ gfm: true }}>
      {"# Hello World\nThis is **bold** text."}
    </Markdown>
  );
}
```

---

## Feature Guide

Start here (pick the approach that matches your use case):

- `Markdown` for static or preloaded content
- `MarkdownStream` + `useMarkdownSession` for streaming tokens
- `headless` API for custom rendering or data processing

### 1) Parsing options (GFM and Math)

Parsing options are passed using the `options` prop.

```tsx
<Markdown options={{ gfm: true, math: true }}>{content}</Markdown>
```

- `gfm` enables GitHub Flavored Markdown features supported by md4c.
- `math` enables `$...$` and `$$...$$` parsing into math nodes.

### 2) Styling and themes

You can override tokens using the `theme` prop. Only provide the tokens you want to change.

```tsx
import { Markdown } from "react-native-nitro-markdown";

const theme = {
  colors: {
    text: "#0f172a",
    heading: "#0f172a",
    link: "#2563eb",
    codeBackground: "#f1f5f9",
  },
  showCodeLanguage: true,
};

<Markdown theme={theme}>{content}</Markdown>;
```

If you use a custom heading font on Android and do not load a bold variant, set `headingWeight: "normal"` to avoid font fallback.

### 3) Per-node style overrides

Override the styles for specific node types with `styles`.

```tsx
<Markdown
  styles={{
    heading: { color: "#0ea5e9", fontWeight: "900" },
    code_block: { backgroundColor: "#e2e8f0", borderRadius: 16 },
    blockquote: { borderLeftColor: "#0ea5e9" },
  }}
>
  {content}
</Markdown>
```

### 4) Custom renderers

Provide a custom renderer for any node type. You get pre-mapped props for common values.

```tsx
import {
  Markdown,
  CodeBlock,
  type HeadingRendererProps,
  type CodeBlockRendererProps,
} from "react-native-nitro-markdown";

const renderers = {
  heading: ({ level, children }: HeadingRendererProps) => (
    <MyHeading level={level}>{children}</MyHeading>
  ),
  code_block: ({ content, language }: CodeBlockRendererProps) => (
    <CodeBlock content={content} language={language} />
  ),
};

<Markdown renderers={renderers}>{content}</Markdown>;
```

Custom renderer behavior:

- Return `undefined` to fall back to the built-in renderer.
- Return `null` to render nothing for that node.
- The `Renderer` prop lets you render nested children the same way the default renderer does.

Pre-mapped props by node type:

| Node type | Extra props |
| --- | --- |
| `heading` | `level` |
| `link` | `href`, `title` |
| `image` | `url`, `alt`, `title` |
| `code_block` | `content`, `language` |
| `code_inline` | `content` |
| `list` | `ordered`, `start` |
| `task_list_item` | `checked` |

### 5) Built-in renderers

All built-in renderers are exported so you can reuse them in custom renderers.

```tsx
import { Heading, CodeBlock, InlineCode } from "react-native-nitro-markdown";
```

Available renderers:

- `Heading`
- `Paragraph`
- `Link`
- `Blockquote`
- `HorizontalRule`
- `CodeBlock`
- `InlineCode`
- `List`
- `ListItem`
- `TaskListItem`
- `TableRenderer`
- `Image`
- `MathInline`
- `MathBlock`

### 6) Streaming (LLM tokens)

Use `MarkdownStream` plus `useMarkdownSession` to stream updates efficiently.

```tsx
import { useEffect } from "react";
import { MarkdownStream, useMarkdownSession } from "react-native-nitro-markdown";

export function AIResponseStream() {
  const session = useMarkdownSession();

  useEffect(() => {
    session.getSession().append("Hello **Nitro**!");
    return () => session.clear();
  }, [session]);

  return (
    <MarkdownStream
      session={session.getSession()}
      options={{ gfm: true }}
      updateStrategy="raf"
      useTransitionUpdates
    />
  );
}
```

Recommended streaming defaults:

- `updateStrategy="raf"` for frame-aligned updates
- `updateIntervalMs` between `50` and `100` when using interval strategy
- Avoid per-token UI updates by batching appends

### 7) Headless parsing

Use the headless entry when you only need the AST or want to build your own renderer.

```tsx
import {
  parseMarkdown,
  parseMarkdownWithOptions,
  getTextContent,
  getFlattenedText,
} from "react-native-nitro-markdown/headless";

const ast = parseMarkdown("# Hello World");
const text = getTextContent(ast);
const normalized = getFlattenedText(ast);
```

### 8) Plain text extraction

If you are already using the `Markdown` component, you can get the plain text during parse.

```tsx
<Markdown
  onParseComplete={(result) => {
    console.log(result.text);
  }}
>
  {content}
</Markdown>
```

### 9) Tables, images, and math

- Tables are rendered with a horizontal scroll view and measured column widths.
- Images use React Native `Image` and try to preserve the real aspect ratio.
- Math nodes render with `react-native-mathjax-svg` if installed; otherwise they fall back to a code-style look.

---

## Common Recipes

### Open links with custom behavior

```tsx
import { Markdown, type LinkRendererProps } from "react-native-nitro-markdown";
import { Text, Linking } from "react-native";

const renderers = {
  link: ({ href, children }: LinkRendererProps) => (
    <Text
      style={{ textDecorationLine: "underline" }}
      onPress={async () => {
        if (href && (await Linking.canOpenURL(href))) {
          Linking.openURL(href);
        }
      }}
    >
      {children}
    </Text>
  ),
};

<Markdown renderers={renderers}>{content}</Markdown>;
```

### Custom image renderer (placeholder + fixed height)

```tsx
import { Markdown, type ImageRendererProps } from "react-native-nitro-markdown";
import { View, Image, Text } from "react-native";

const renderers = {
  image: ({ url, title, alt }: ImageRendererProps) => (
    <View>
      <Image source={{ uri: url }} style={{ height: 220, borderRadius: 12 }} />
      {(title || alt) && (
        <Text style={{ marginTop: 6, opacity: 0.6 }}>{title || alt}</Text>
      )}
    </View>
  ),
};
```

### Render HTML nodes as code (opt-in)

```tsx
import { Markdown, CodeBlock, InlineCode } from "react-native-nitro-markdown";

const renderers = {
  html_block: ({ node }) => <CodeBlock content={node.content ?? \"\"} />,
  html_inline: ({ node }) => <InlineCode content={node.content ?? \"\"} />,
};
```

### Minimal styling + custom palette

```tsx
import { Markdown } from "react-native-nitro-markdown";

<Markdown
  stylingStrategy="minimal"
  theme={{ colors: { text: "#e2e8f0", link: "#38bdf8" } }}
>
  {content}
</Markdown>;
```

### Build a search index (headless)

```tsx
import { parseMarkdown, getFlattenedText } from "react-native-nitro-markdown/headless";

const ast = parseMarkdown(content);
const plainText = getFlattenedText(ast);
```

---

## API Reference

### Markdown component

```tsx
import { Markdown } from "react-native-nitro-markdown";
```

Props:

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `string` | required | Markdown string to parse and render |
| `options` | `{ gfm?: boolean; math?: boolean }` | `undefined` | Parser options |
| `renderers` | `CustomRenderers` | `{}` | Custom renderers by node type |
| `theme` | `PartialMarkdownTheme` | `defaultMarkdownTheme` | Theme token overrides |
| `styles` | `NodeStyleOverrides` | `undefined` | Per-node style overrides |
| `stylingStrategy` | `"opinionated" \| "minimal"` | `"opinionated"` | Styling baseline |
| `style` | `StyleProp<ViewStyle>` | `undefined` | Container style |
| `onParsingInProgress` | `() => void` | `undefined` | Called when parsing starts |
| `onParseComplete` | `(result) => void` | `undefined` | Called with `{ raw, ast, text }` |

### MarkdownStream

```tsx
import { MarkdownStream } from "react-native-nitro-markdown";
```

Props (in addition to all `Markdown` props except `children`):

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `session` | `MarkdownSession` | required | Active session for streaming text |
| `updateIntervalMs` | `number` | `50` | Throttle interval for updates |
| `updateStrategy` | `"interval" \| "raf"` | `"interval"` | Update strategy |
| `useTransitionUpdates` | `boolean` | `false` | Use React transitions |

### Hooks and sessions

```tsx
import { useMarkdownSession, createMarkdownSession, useStream } from "react-native-nitro-markdown";
```

- `useMarkdownSession()` returns a managed session and helpers: `getSession`, `setIsStreaming`, `stop`, `clear`, `setHighlight`.
- `createMarkdownSession()` creates a session without React hooks.
- `useStream(timestamps)` adds a simple sync helper for time-based streaming.

### Headless API

```tsx
import { parseMarkdown, parseMarkdownWithOptions, getTextContent, getFlattenedText } from "react-native-nitro-markdown/headless";
```

### Theme utilities

```tsx
import {
  defaultMarkdownTheme,
  minimalMarkdownTheme,
  mergeThemes,
} from "react-native-nitro-markdown";
```

### Types

```tsx
import type {
  CustomRenderers,
  NodeStyleOverrides,
  MarkdownTheme,
  PartialMarkdownTheme,
} from "react-native-nitro-markdown";
```

---

## Supported Node Types

You can customize any of these node types with `renderers` or `styles`.

`document`, `heading`, `paragraph`, `text`, `bold`, `italic`, `strikethrough`, `link`, `image`, `code_inline`, `code_block`, `blockquote`, `horizontal_rule`, `line_break`, `soft_break`, `table`, `table_head`, `table_body`, `table_row`, `table_cell`, `list`, `list_item`, `task_list_item`, `math_inline`, `math_block`, `html_block`, `html_inline`

Note: `html_inline` and `html_block` are parsed but not rendered by default.

---

## AST Shape

The headless API returns a typed AST. This is the core shape used by the renderer.

```ts
export interface MarkdownNode {
  type:
    | "document"
    | "heading"
    | "paragraph"
    | "text"
    | "bold"
    | "italic"
    | "strikethrough"
    | "link"
    | "image"
    | "code_inline"
    | "code_block"
    | "blockquote"
    | "horizontal_rule"
    | "line_break"
    | "soft_break"
    | "table"
    | "table_head"
    | "table_body"
    | "table_row"
    | "table_cell"
    | "list"
    | "list_item"
    | "task_list_item"
    | "math_inline"
    | "math_block"
    | "html_block"
    | "html_inline";
  content?: string;
  children?: MarkdownNode[];
  level?: number;
  href?: string;
  title?: string;
  alt?: string;
  language?: string;
  ordered?: boolean;
  start?: number;
  checked?: boolean;
  align?: string;
  isHeader?: boolean;
}
```

---

## Troubleshooting

- Math renders as plain text: install `react-native-mathjax-svg` and `react-native-svg`.
- iOS build errors: run `pod install` after installing dependencies.
- Expo: you must use a development build (`expo prebuild` + `expo run`), not Expo Go.
- Android heading font looks wrong: set `headingWeight: "normal"` when your font has no bold variant.

---

## Contributing

See `CONTRIBUTING.md` for the workflow and development commands.

## License

MIT
