# react-native-nitro-markdown

[![npm version](https://img.shields.io/npm/v/react-native-nitro-markdown?color=f97316&label=npm)](https://www.npmjs.com/package/react-native-nitro-markdown)
[![npm downloads](https://img.shields.io/npm/dm/react-native-nitro-markdown?color=22c55e&label=downloads)](https://www.npmjs.com/package/react-native-nitro-markdown)
[![CI](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/actions/workflows/ci.yml/badge.svg)](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/react-native-nitro-markdown?color=007ec6)](https://github.com/JoaoPauloCMarra/react-native-nitro-markdown/blob/main/LICENSE)
[![React Native](https://img.shields.io/badge/react--native-%3E%3D0.75-61dafb)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/expo-SDK%2056-000020)](https://docs.expo.dev/versions/v56.0.0/)
[![Nitro Modules](https://img.shields.io/badge/nitro--modules-%3E%3D0.35.7-black)](https://www.npmjs.com/package/react-native-nitro-modules)
[![TypeScript](https://img.shields.io/badge/typescript-6.0-3178c6)](https://www.typescriptlang.org/)

Markdown parsing, rendering, streaming, and headless AST access for React
Native, powered by md4c and Nitro Modules.

Use it when you need GitHub-flavored Markdown, custom native renderers,
streaming chat or LLM output, syntax highlighting, math rendering, or headless
AST access without building your own parser pipeline.

<p align="center">
  <img src="https://raw.githubusercontent.com/JoaoPauloCMarra/react-native-nitro-markdown/main/readme/demo.gif" alt="react-native-nitro-markdown demo" width="400" />
</p>

## Install

```sh
bun add react-native-nitro-markdown react-native-nitro-modules ratex-react-native
```

`react-native-nitro-modules` and `ratex-react-native` are peer dependencies
because parsing and math rendering use native code.

For Expo development builds:

```sh
bunx expo install react-native-nitro-markdown react-native-nitro-modules ratex-react-native
bunx expo prebuild
```

For bare React Native apps:

```sh
cd ios && pod install
```

Expo Go cannot load Nitro native modules. Use an Expo development build or a
bare app.

## Expo Config

No package config plugin is required for `react-native-nitro-markdown`.

Use your normal Expo app config, install the native dependencies, then run
`bunx expo prebuild` after adding or upgrading the package.

## Quick Start

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

## Streaming

```tsx
import { useEffect } from "react";
import {
  MarkdownStream,
  useMarkdownSession,
} from "react-native-nitro-markdown";

export function ChatMessage({ text }: { text: string }) {
  const session = useMarkdownSession();

  useEffect(() => {
    session.reset(text);
  }, [session, text]);

  return (
    <MarkdownStream session={session} updateStrategy="raf" incrementalParsing />
  );
}
```

For token-by-token output, append to the hook-owned session and let
`MarkdownStream` subscribe to range updates:

```tsx
const session = useMarkdownSession();

session.getSession().append("Hello ");
session.getSession().append("**world**");
```

`MarkdownStream` batches updates for append-only text. Use
`updateStrategy="raf"` for visual streaming, or `updateStrategy="interval"` with
`updateIntervalMs={50}` to bound update frequency. If any plugin uses
`beforeParse`, incremental AST optimization is disabled so the full pipeline can
run correctly. `MarkdownStream` accepts the controller returned by
`useMarkdownSession()`. Pass `session.getSession()` only when another API needs
direct access to the native session object.

### Custom stream rendering

Use `renderMarkdown` when you want `MarkdownStream` to keep the session
subscription, batching, and incremental AST updates while another component owns
the rendering. The callback receives the current text, the reusable source AST
when available, and `markdownProps` that match the built-in `Markdown`
component:

```tsx
<MarkdownStream
  session={session}
  renderMarkdown={({ text, sourceAst, markdownProps }) => (
    <MyMarkdownRenderer
      markdown={text}
      ast={sourceAst}
      fallbackProps={markdownProps}
    />
  )}
/>
```

Use `useMarkdownStreamState` when you want the streaming state without the
`MarkdownStream` wrapper:

```tsx
const { text, sourceAst, sourceAstStatus } = useMarkdownStreamState({
  session,
  updateStrategy: "raf",
});
```

`sourceAst` is available when the stream can safely reuse Nitro's parsed AST.
When a `beforeParse` plugin is present, `sourceAstStatus` becomes `"disabled"`
and `sourceAstDisabledReason` is `"beforeParse-plugin"`. In that state,
`sourceAst` is omitted; render from `text` so the full plugin pipeline can run.

`MarkdownStream` avoids full-buffer reads on stable parent renders. It uses
native range reads for append-only updates, then falls back to a full session
read only for reset-like changes, replacements inside existing text, or native
range-read failures.

## Headless Parsing

```ts
import {
  extractPlainText,
  parseMarkdown,
  parseMarkdownWithOptions,
} from "react-native-nitro-markdown/headless";

const ast = parseMarkdown("# Title");
const astWithMath = parseMarkdownWithOptions("Inline $x^2$", {
  math: true,
});
const text = extractPlainText("Hello **world**");
```

Use the `react-native-nitro-markdown/headless` export when you need AST data,
plain text extraction, indexing, validation, or tests without rendering UI.

## Source AST Rendering

If you already have a `MarkdownNode`, pass it through the `sourceAst` prop to
skip native parsing during render:

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

## Common Options

| Prop or parser option | Default           | What it does                                              |
| --------------------- | ----------------- | --------------------------------------------------------- |
| `options.gfm`         | `true`            | Enables tables, strikethrough, task lists, and autolinks. |
| `options.math`        | `true`            | Parses inline and block math nodes.                       |
| `options.html`        | `false`           | Preserves raw HTML nodes for custom renderers.            |
| `parseCache`          | `true`            | Reuses parsed ASTs for repeated content.                  |
| `sourceAst`           | `undefined`       | Renders a pre-parsed AST instead of parsing `children`.   |
| `highlightCode`       | `false`           | Enables built-in syntax highlighting.                     |
| `tableOptions`        | Built-in defaults | Controls table measurement and minimum widths.            |

## Compatibility

| Dependency | Supported range or baseline |
| ---------- | --------------------------- |
| [React Native](https://reactnative.dev/) | `>=0.75.0` |
| [Nitro Modules](https://www.npmjs.com/package/react-native-nitro-modules) | `>=0.35.7` |
| [RaTeX React Native](https://www.npmjs.com/package/ratex-react-native) | `>=0.1.4` |
| [Expo](https://docs.expo.dev/versions/v56.0.0/) | SDK 56 development builds |
| [TypeScript](https://www.typescriptlang.org/) | 6.0 in this package workspace |

## Custom Rendering

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

Custom renderers receive parsed nodes and pre-mapped props for common node
types. For `html_inline` and `html_block`, read `node.content` directly.

For stronger component-local typing, use the node-specific renderer props:

```tsx
import type { CodeBlockRendererProps } from "react-native-nitro-markdown";

function CodeBlock({ content, language }: CodeBlockRendererProps) {
  return <Text>{`${language ?? "text"}: ${content}`}</Text>;
}
```

## Plugin Pipeline

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

Pipeline order: `beforeParse` plugins, parse or `sourceAst`, `afterParse`
plugins, `astTransform`, then render. Higher `priority` values run first, and
sorting is stable. `onError` receives `(error, phase, pluginName?)` for parser
and plugin failures.

## TypeScript Guidance

The public types are exported from the root package and the headless subpath.
Prefer package types over local object shapes so editors and AI tools can catch
invalid parser options, node names, renderer props, and stream session usage.

```tsx
import { Text } from "react-native";
import type {
  CustomRendererPropsByNode,
  MarkdownNode,
  MarkdownPlugin,
  MarkdownRenderers,
  MarkdownStreamProps,
  ParserOptions,
} from "react-native-nitro-markdown";

const options: ParserOptions = { gfm: true, math: true, html: false };

function HeadingRenderer({
  children,
  level,
}: CustomRendererPropsByNode["heading"]) {
  return <Text accessibilityRole="header">{`${level}. ${children}`}</Text>;
}

const renderers: MarkdownRenderers = {
  heading: HeadingRenderer,
};

const plugin: MarkdownPlugin = {
  name: "strip-tracking",
  afterParse(ast: MarkdownNode) {
    return ast;
  },
};

const streamProps: Pick<MarkdownStreamProps, "updateStrategy"> = {
  updateStrategy: "raf",
};
```

## API

Main export:

- `Markdown` for rendering complete markdown strings.
- `MarkdownStream` for incremental rendering.
- `MarkdownSession` and `useMarkdownSession()` for append/replace/reset flows.
- `useMarkdownStreamState()` for headless streaming text and AST state.
- `useStream()` for timestamped stream state.
- `defaultMarkdownTheme` and theme types.
- Renderer components such as `Paragraph`, `Heading`, `Link`, `CodeBlock`,
  `List`, `Table`, and `Image`.
- Types including `MarkdownNode`, `MarkdownPlugin`, `CustomRenderers`,
  `MarkdownRenderers`, `CustomRendererPropsByNode`, `ParserOptions`,
  `MarkdownTheme`, `MarkdownSessionController`, `MarkdownStreamProps`,
  `MarkdownStreamRenderProps`, `MarkdownStreamState`,
  `MarkdownStreamSourceAstStatus`, `MarkdownStreamSourceAstDisabledReason`,
  `UseMarkdownStreamStateOptions`, `CodeHighlighter`, `HighlightedToken`,
  `TokenType`, and `UrlSafetyOptions`.

Headless export:

- `parseMarkdown`.
- `parseMarkdownWithOptions`.
- `extractPlainText`.
- `extractPlainTextWithOptions`.
- AST helpers such as `getTextContent`, `getFlattenedText`, and
  `stripSourceOffsets`.

## Platform Support

| Platform | Status                                     |
| -------- | ------------------------------------------ |
| iOS      | Native parser through Nitro and md4c.      |
| Android  | Native parser through Nitro and md4c.      |
| Expo     | Development builds.                        |
| Web      | Not supported. The parser requires Nitro Modules (JSI); there is no web entrypoint and imports on web fail deterministically. |

## Troubleshooting

- **Expo Go error:** build a dev client; Expo Go cannot load Nitro modules.
- **Streaming updates too often:** use `updateStrategy="raf"` or an interval
  around 50-100ms.
- **Plugin changes do not appear incremental:** `beforeParse` plugins force a
  full parse by design.
- **Math does not render:** ensure `ratex-react-native` is installed and native
  code has been rebuilt.

## Development

```sh
bun install
bun run check
bun run release:preflight
bun run example:android
bun run example:ios
```

Run native example builds before release when changing native, Nitro, rendering,
or packaging files.

## License

MIT
