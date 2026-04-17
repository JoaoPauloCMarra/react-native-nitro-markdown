<p align="center">
  <img src="./readme/demo.gif" alt="react-native-nitro-markdown demo" width="400" />
</p>

# react-native-nitro-markdown

Native Markdown parsing and rendering for React Native, powered by [md4c](https://github.com/mity/md4c) (C++) through [Nitro Modules](https://github.com/mrousavy/nitro) (JSI).

## Features

- **Native C++ parser** -- synchronous parsing via JSI with minimal JS thread overhead
- **Full rendering pipeline** -- parser + renderer + streaming session in one package
- **GFM support** -- tables, strikethrough, task lists, autolinks
- **Math rendering** -- inline and block LaTeX via `react-native-mathjax-svg` (optional)
- **Opt-in HTML AST nodes** -- preserve raw HTML as `html_inline` / `html_block` for custom renderers
- **Large document support** -- top-level block virtualization and cached renderer styles
- **Code highlighting** -- built-in JS/TS, Python, and Bash tokenizer with custom highlighter support
- **Headless API** -- parse markdown and extract text without any UI
- **Streaming** -- incremental rendering for chat/LLM token streams
- **Customizable** -- themes, per-node style overrides, custom renderers, AST transforms, plugin pipeline

## Requirements

| Dependency | Version |
|---|---|
| React Native | `>=0.75.0` |
| react-native-nitro-modules | `>=0.35.4` |
| react-native-mathjax-svg *(optional)* | `>=0.9.0` |
| react-native-svg *(optional, for math)* | `>=13.0.0` |

## Installation

With npm:

```bash
npm install react-native-nitro-markdown react-native-nitro-modules
cd ios && pod install
```

With Bun:

```bash
bun add react-native-nitro-markdown react-native-nitro-modules
cd ios && pod install
```

For math rendering:

```bash
npm install react-native-mathjax-svg react-native-svg
```

**Expo** (development build):

```bash
npx expo install react-native-nitro-markdown react-native-nitro-modules
npx expo prebuild
```

## Quick Start

```tsx
import { Markdown } from "react-native-nitro-markdown";

export function Example() {
  return (
    <Markdown options={{ gfm: true }}>
      {"# Hello\nThis is **native** markdown."}
    </Markdown>
  );
}
```

## API Reference

### Parser Options

`ParserOptions` controls native parser extensions. Defaults are conservative for HTML and feature-complete for Markdown extensions.

| Option | Default | Enables | Notes |
|---|---:|---|---|
| `gfm` | `true` | Tables, strikethrough, task lists, permissive autolinks | Set `false` for stricter CommonMark-style parsing |
| `math` | `true` | Inline and display LaTeX spans | Rendering falls back to plain styled text unless optional math deps are installed |
| `html` | `false` | `html_inline` and `html_block` AST nodes | Raw HTML is not rendered by default; provide custom renderers |

```tsx
<Markdown options={{ gfm: true, math: true, html: false }}>
  {content}
</Markdown>
```

### `<Markdown>`

The main component. Parses a markdown string and renders it.

```tsx
import { Markdown } from "react-native-nitro-markdown";
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `children` | `string` | required | Markdown input string |
| `options` | `ParserOptions` | -- | Parser flags (`gfm`, `math`, `html`) |
| `plugins` | `MarkdownPlugin[]` | -- | Plugin hooks (`beforeParse`, `afterParse`) |
| `sourceAst` | `MarkdownNode` | -- | Pre-parsed AST; skips native parse when provided |
| `astTransform` | `AstTransform` | -- | Post-parse AST rewrite before render |
| `renderers` | `CustomRenderers` | `{}` | Per-node custom renderer overrides |
| `theme` | `PartialMarkdownTheme` | `defaultMarkdownTheme` | Theme token overrides |
| `styles` | `NodeStyleOverrides` | -- | Per-node style overrides |
| `stylingStrategy` | `"opinionated" \| "minimal"` | `"opinionated"` | Base styling preset |
| `style` | `StyleProp<ViewStyle>` | -- | Container style |
| `onLinkPress` | `LinkPressHandler` | -- | Intercept link presses; return `false` to block default open |
| `onParsingInProgress` | `() => void` | -- | Called when parse inputs change |
| `onParseComplete` | `(result) => void` | -- | Called with `{ raw, ast, text }` after parse |
| `onError` | `(error, phase, pluginName?) => void` | -- | Error handler for parse/plugin failures |
| `highlightCode` | `boolean \| CodeHighlighter` | -- | Enable syntax highlighting for code blocks |
| `tableOptions` | `{ minColumnWidth?; measurementStabilizeMs? }` | -- | Table layout tuning |
| `virtualize` | `boolean \| "auto"` | `false` | Top-level block virtualization |
| `virtualizationMinBlocks` | `number` | `40` | Block threshold for `"auto"` virtualization |
| `virtualization` | `MarkdownVirtualizationOptions` | -- | FlatList tuning (windowSize, batching, etc.) |

**Pipeline order:** `beforeParse` plugins (by priority desc) -> parse/sourceAst -> `afterParse` plugins (by priority desc) -> `astTransform` -> render.

### `<MarkdownStream>`

Renders markdown from a streaming session. Extends `MarkdownProps` (minus `children`).

```tsx
import { MarkdownStream } from "react-native-nitro-markdown";
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `session` | `MarkdownSession` | required | Session supplying streamed text |
| `updateIntervalMs` | `number` | `50` | Flush interval for `"interval"` strategy |
| `updateStrategy` | `"interval" \| "raf"` | `"interval"` | Update cadence |
| `useTransitionUpdates` | `boolean` | `false` | Wrap updates in `startTransition` |
| `incrementalParsing` | `boolean` | `true` | Append-optimized incremental AST updates |

### `MarkdownSession`

A native text buffer with change listeners, used for streaming.

```tsx
import { createMarkdownSession } from "react-native-nitro-markdown";

const session = createMarkdownSession();
session.append("# Hello\n");
session.append("Streaming content...");
```

| Method | Signature | Description |
|---|---|---|
| `append` | `(chunk: string) => number` | Append text, returns new UTF-16 length |
| `clear` | `() => void` | Clear buffer, emit reset event |
| `reset` | `(text: string) => void` | Replace full buffer content |
| `replace` | `(from, to, text) => number` | Partial buffer mutation |
| `getAllText` | `() => string` | Get full session text |
| `getLength` | `() => number` | Get UTF-16 length without copy |
| `getTextRange` | `(from, to) => string` | Get substring range |
| `addListener` | `(listener) => () => void` | Subscribe to mutation events; returns unsubscribe |
| `highlightPosition` | `number` | Mutable cursor for stream highlight |

### `useMarkdownSession()`

Creates and owns a `MarkdownSession` for a component lifecycle.

```tsx
import { useMarkdownSession } from "react-native-nitro-markdown";

const { getSession, isStreaming, setIsStreaming, stop, clear, setHighlight } =
  useMarkdownSession();
```

### `useStream(timestamps?)`

Extends `useMarkdownSession` with timeline sync for timed playback.

```tsx
import { useStream } from "react-native-nitro-markdown";

const stream = useStream({ 0: 0, 1: 500, 2: 1000 });
stream.sync(currentTimeMs);

<MarkdownStream session={stream.getSession()} />;
```

### Headless API

Parse markdown without any UI. Available from both entry points.

```tsx
import {
  parseMarkdown,
  parseMarkdownWithOptions,
  extractPlainText,
  getTextContent,
  getFlattenedText,
  stripSourceOffsets,
} from "react-native-nitro-markdown/headless";
```

| Function | Description |
|---|---|
| `parseMarkdown(text, options?)` | Parse to AST (options: `{ gfm?, math?, html? }`) |
| `parseMarkdownWithOptions(text, options)` | Parse with explicit options |
| `extractPlainText(text)` | Parse and return plain text from native parser |
| `extractPlainTextWithOptions(text, options)` | Same with parser flags |
| `getTextContent(node)` | Concatenate text recursively (no normalization) |
| `getFlattenedText(node)` | Normalized plain text with block separators |
| `stripSourceOffsets(node)` | Remove `beg`/`end` fields from AST |

### Custom Renderers

Override rendering for specific node types:

```tsx
import {
  Markdown,
  type HeadingRendererProps,
  type CodeBlockRendererProps,
} from "react-native-nitro-markdown";

<Markdown
  renderers={{
    heading: ({ level, children }: HeadingRendererProps) => (
      <MyHeading level={level}>{children}</MyHeading>
    ),
    code_block: ({ language, content }: CodeBlockRendererProps) => (
      <MyCode language={language} content={content} />
    ),
  }}
>
  {content}
</Markdown>;
```

Renderers receive `EnhancedRendererProps` with `node`, `children`, and `Renderer` (for recursive rendering). Node-specific props are mapped automatically:

| Node type | Extra props |
|---|---|
| `heading` | `level` |
| `link` | `href`, `title` |
| `image` | `url`, `alt`, `title` |
| `code_block` | `content`, `language` |
| `code_inline` | `content` |
| `list` | `ordered`, `start` |
| `task_list_item` | `checked` |
| `html_inline`, `html_block` | Read raw HTML from `node.content` |

Return `undefined` to fall back to the built-in renderer, or `null` to render nothing.

#### Rendering HTML Nodes

HTML parsing is opt-in and produces raw AST nodes. The built-in renderer intentionally renders nothing for `html_inline` and `html_block`; applications decide what is safe to display.

```tsx
import { Text, View } from "react-native";
import { Markdown } from "react-native-nitro-markdown";

<Markdown
  options={{ html: true }}
  renderers={{
    html_inline: ({ node }) => {
      if (node.content === "<br>") return <Text>{"\n"}</Text>;
      return null;
    },
    html_block: ({ node }) => {
      if (!node.content?.includes('data-kind="release-note"')) return null;
      return (
        <View>
          <Text>Release note</Text>
        </View>
      );
    },
  }}
>
  {content}
</Markdown>;
```

Do not pass untrusted HTML directly into a WebView from a renderer. Sanitize or map known tags/attributes to native components.

### Theme API

```tsx
import {
  Markdown,
  defaultMarkdownTheme,
  minimalMarkdownTheme,
  mergeThemes,
} from "react-native-nitro-markdown";

const theme = mergeThemes(defaultMarkdownTheme, {
  colors: { text: "#0f172a", link: "#1d4ed8" },
  fontSizes: { m: 16 },
});

<Markdown theme={theme}>{content}</Markdown>;
```

`MarkdownTheme` includes:
- **colors** -- `text`, `heading`, `link`, `code`, `codeBackground`, `blockquote`, `border`, `surface`, table colors, and optional `codeTokenColors` for syntax highlighting
- **spacing** -- `xs`, `s`, `m`, `l`, `xl`
- **fontSizes** -- `xs` through `xl`, plus `h1`-`h6`
- **fontFamilies** -- `regular`, `heading`, `mono`
- **borderRadius** -- `s`, `m`, `l`
- **headingWeight** -- optional font weight override
- **showCodeLanguage** -- show/hide language label on code blocks

Use `stylingStrategy="minimal"` for a bare baseline, or `NodeStyleOverrides` for per-node style overrides (text nodes accept `TextStyle`, container nodes accept `ViewStyle`).

## Examples

### Streaming

```tsx
import { useEffect } from "react";
import {
  MarkdownStream,
  useMarkdownSession,
} from "react-native-nitro-markdown";

export function StreamingExample() {
  const session = useMarkdownSession();

  useEffect(() => {
    const s = session.getSession();
    s.append("# Streaming\n");
    s.append("This text arrives in chunks.");
    return () => session.clear();
  }, [session]);

  return (
    <MarkdownStream
      session={session.getSession()}
      options={{ gfm: true }}
      updateStrategy="raf"
    />
  );
}
```

### AST Transform

```tsx
import { useCallback } from "react";
import { Markdown, type AstTransform } from "react-native-nitro-markdown";

const transform = useCallback<AstTransform>((ast) => {
  const visit = (node: Parameters<AstTransform>[0]): typeof node => ({
    ...node,
    content:
      node.type === "text"
        ? (node.content ?? "").replace(/:wink:/g, "😉")
        : node.content,
    children: node.children?.map(visit),
  });
  return visit(ast);
}, []);

<Markdown astTransform={transform}>{"Hello :wink:"}</Markdown>;
```

### Plugin Pipeline

```tsx
import { Markdown, type MarkdownPlugin } from "react-native-nitro-markdown";

const plugins: MarkdownPlugin[] = [
  {
    name: "rewrite-before-parse",
    priority: 10,
    beforeParse: (input) => input.replace(/:rocket:/g, "ROCKET_TOKEN"),
  },
  {
    name: "rewrite-after-parse",
    afterParse: (ast) => {
      const visit = (node: typeof ast): typeof ast => ({
        ...node,
        content:
          node.type === "text"
            ? (node.content ?? "").replace(/ROCKET_TOKEN/g, "🚀")
            : node.content,
        children: node.children?.map(visit),
      });
      return visit(ast);
    },
  },
];

<Markdown plugins={plugins}>{"Launch :rocket:"}</Markdown>;
```

### Pre-parsed AST

```tsx
import { Markdown, parseMarkdownWithOptions } from "react-native-nitro-markdown";

const ast = parseMarkdownWithOptions(content, {
  gfm: true,
  math: true,
  html: false,
});

<Markdown sourceAst={ast}>{"ignored when sourceAst is provided"}</Markdown>;
```

### Virtualization (large documents)

```tsx
<Markdown
  virtualize="auto"
  virtualizationMinBlocks={30}
  virtualization={{
    initialNumToRender: 10,
    maxToRenderPerBatch: 10,
    windowSize: 8,
  }}
>
  {content}
</Markdown>
```

Keep `Markdown` as the primary vertical scroller when virtualization is enabled -- avoid nesting inside another `ScrollView`.

### Syntax Highlighting

```tsx
import type { CodeHighlighter } from "react-native-nitro-markdown";

// Built-in highlighter (JS/TS, Python, Bash)
<Markdown highlightCode>{"```typescript\nconst x: number = 42;\n```"}</Markdown>

// Custom highlighter
const myHighlighter: CodeHighlighter = (language, code) => {
  return [{ text: code, type: "default" }];
};

<Markdown highlightCode={myHighlighter}>{content}</Markdown>
```

### Link Interception

```tsx
<Markdown
  onLinkPress={(href) => {
    if (href.startsWith("/")) {
      router.push(href);
      return false;
    }
  }}
>
  {content}
</Markdown>
```

Default link behavior: trims href, calls `onLinkPress`, validates scheme (`http:`, `https:`, `mailto:`, `tel:`, `sms:`), then opens via `Linking.openURL`. Relative URLs and anchors are ignored unless handled in `onLinkPress`.

## Supported Node Types

`document`, `heading`, `paragraph`, `text`, `bold`, `italic`, `strikethrough`, `link`, `image`, `code_inline`, `code_block`, `blockquote`, `horizontal_rule`, `line_break`, `soft_break`, `table`, `table_head`, `table_body`, `table_row`, `table_cell`, `list`, `list_item`, `task_list_item`, `math_inline`, `math_block`, `html_block`, `html_inline`

`html_inline` and `html_block` are parsed only when `options.html` is `true`; they are not rendered by default. Use a custom renderer to handle them, and read raw HTML from `node.content`.

## Package Exports

### Main (`react-native-nitro-markdown`)

Components, hooks, sessions, themes, built-in renderers, syntax highlighting, and all headless APIs.

### Headless (`react-native-nitro-markdown/headless`)

Parser and text utilities only -- no React dependencies. Use this for server-side processing, search indexing, or custom renderers.

## Performance Tips

- Use `updateStrategy="raf"` for streaming UI updates.
- Batch `session.append()` calls at 50-100ms intervals rather than per-character.
- Enable `virtualize="auto"` for long documents and keep `Markdown` as the primary vertical scroller.
- Memoize custom `plugins`, `renderers`, `theme`, and `styles` objects when they are created inside a component.
- Use the headless API when you only need parsing, plain text extraction, search indexing, or a custom renderer.

## Troubleshooting

| Problem | Solution |
|---|---|
| Math renders as code-style fallback | Install `react-native-mathjax-svg` and `react-native-svg` |
| iOS build fails after install | Run `pod install` in your iOS directory |
| Expo app doesn't load native module | Use a development build (`expo prebuild` + `expo run`), not Expo Go |
| Android heading font weight looks wrong | Set `theme.headingWeight` explicitly |

## Example App

The `apps/example` directory contains a full demo app with these screens:

| Screen | File | Demonstrates |
|---|---|---|
| Bench | `app/index.tsx` | Smoke tests + benchmark vs JS parsers |
| Default | `app/render-default.tsx` | Built-in renderer defaults |
| Styles | `app/render-default-styles.tsx` | Theme and style overrides |
| Custom | `app/render-custom.tsx` | HTML AST rendering, custom renderers, AST transform |
| Stream | `app/render-stream.tsx` | Live streaming with token append |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

MIT
