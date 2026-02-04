<p align="center">
  <img src="./readme/demo.gif" alt="react-native-nitro-markdown demo" width="300" />
  <img src="./readme/stream-demo.gif" alt="react-native-nitro-markdown stream demo" width="300" />
</p>

# react-native-nitro-markdown 🚀

> The fastest Markdown parser for React Native. Period.

[![npm version](https://img.shields.io/npm/v/react-native-nitro-markdown?style=flat-square)](https://www.npmjs.com/package/react-native-nitro-markdown)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)
[![Nitro Modules](https://img.shields.io/badge/Powered%20by-Nitro%20Modules-blueviolet?style=flat-square)](https://nitro.margelo.com)

**react-native-nitro-markdown** is a high-performance Markdown parser built on **[md4c](https://github.com/mity/md4c)** (C++) and **[Nitro Modules](https://nitro.margelo.com)**. It parses complex Markdown, GFM, and LaTeX Math into a structured AST **synchronously** via JSI, bypassing the React Native Bridge entirely.

---

## ⚡ Why Nitro? (Benchmarks)

We benchmarked this library against the most popular JavaScript parsers on a real mobile device (iPhone 15 Pro, Release Mode) using a heavy **237KB** Markdown document.

| Parser                      | Time (ms)  | Speedup           | Frame Drops (60fps)   |
| :-------------------------- | :--------- | :---------------- | :-------------------- |
| **🚀 Nitro Markdown (C++)** | **~29 ms** | **1x (Baseline)** | **~1 frame** (Smooth) |
| 📋 CommonMark (JS)          | ~82 ms     | 2.8x slower       | ~5 frames (Jank)      |
| 🏗️ Markdown-It (JS)         | ~118 ms    | 4.0x slower       | ~7 frames (Jank)      |
| 💨 Marked (JS)              | ~400 ms    | 13.5x slower      | ~24 frames (Freeze)   |

> **Takeaway:** JavaScript parsers trigger Garbage Collection pauses. Nitro uses C++ to parse efficiently with zero-copy overhead, keeping your UI thread responsive.

---

## 📦 Installation

Choose your preferred package manager to install the package and its core dependency (`react-native-nitro-modules`).

### **1. Install Dependencies**

**npm**

```bash
npm install react-native-nitro-markdown react-native-nitro-modules
```

> **Note:** If you want to use **Math** (LaTeX) or certain **Image** features, you should also install the optional peer dependencies:
> `npm install react-native-svg react-native-mathjax-svg`

**Yarn**

```bash
yarn add react-native-nitro-markdown react-native-nitro-modules
```

**Bun**

```bash
bun add react-native-nitro-markdown react-native-nitro-modules
```

**pnpm**

```bash
pnpm add react-native-nitro-markdown react-native-nitro-modules
```

### **2. Install Native Pods (iOS)**

**Standard**

```bash
cd ios && pod install
```

### **3. Expo Users**

If you are using Expo, you must run a **Prebuild** (Development Build) because this package contains native C++ code.

```bash
bunx expo install react-native-nitro-markdown react-native-nitro-modules
bunx expo prebuild
```

---

## 💻 Usage

### Option 1: Batteries Included (Simplest)

Use the `Markdown` component with clean, neutral styling that stays out of the way:

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

If you're rendering on a dark surface, override `theme.colors.text` (or use the `styles` prop) to match your app's palette.

### Option 2: Style Overrides per Node Type

Apply quick style overrides to specific node types without writing custom renderers:

```tsx
<Markdown
  styles={{
    heading: { color: "#0ea5e9", fontWeight: "900" },
    code_block: { backgroundColor: "#e2e8f0", borderRadius: 16 },
    blockquote: { borderLeftColor: "#0ea5e9" },
  }}
>
  {markdown}
</Markdown>
```

### Option 3: Custom Renderers

Override specific node types with full control. Custom renderers receive **pre-mapped props** for common values:

```tsx
import {
  Markdown,
  CodeBlock,
  type HeadingRendererProps,
  type CodeBlockRendererProps,
} from "react-native-nitro-markdown";

const renderers = {
  // Pre-mapped `level` prop - no need for node.level!
  heading: ({ level, children }: HeadingRendererProps) => (
    <MyHeading level={level}>{children}</MyHeading>
  ),

  // Pre-mapped `content` and `language` - no getTextContent() needed!
  code_block: ({ content, language }: CodeBlockRendererProps) => (
    <CodeBlock
      content={content}
      language={language}
      style={{ borderWidth: 2 }}
    />
  ),
};

<Markdown renderers={renderers} options={{ gfm: true }}>
  {markdown}
</Markdown>;
```

**Pre-mapped Props by Node Type:**

- `heading` → `level` (1-6)
- `link` → `href`, `title`
- `image` → `url`, `alt`, `title`
- `code_block` → `content`, `language`
- `code_inline` → `content`
- `list` → `ordered`, `start`
- `task_list_item` → `checked`

### Option 4: Token Overrides (Theme)

Customize the look and feel by passing a partial `theme` object:

```tsx
import { Markdown } from "react-native-nitro-markdown";

const myTheme = {
  colors: {
    text: "#0f172a",
    heading: "#0f172a",
    link: "#0ea5e9",
    codeBackground: "#e2e8f0",
  },
  showCodeLanguage: false,
};

<Markdown theme={myTheme}>{"# Custom Themed Markdown"}</Markdown>;
```

Defaults live in `defaultMarkdownTheme` and are intentionally neutral so you can layer your own palette on top.

**Theme Properties:**

- `colors` - All color tokens (text, heading, link, code, codeBackground, codeLanguage, etc.)
- `spacing` - Spacing tokens (xs, s, m, l, xl)
- `fontSizes` - Font sizes (xs, s, m, l, xl, h1-h6)
- `fontFamilies` - Font families for regular, heading, and mono text
- `borderRadius` - Border radius tokens (s, m, l)
- `showCodeLanguage` - Show/hide code block language labels

### Option 5: Minimal Styling Strategy

Start with a clean slate using the `stylingStrategy` prop:

```tsx
<Markdown stylingStrategy="minimal" theme={myLightTheme}>
  {content}
</Markdown>
```

This zeros out all spacing and removes opinionated colors, letting you build up from scratch.

### Option 6: Style Props on Individual Renderers

All built-in renderers accept a `style` prop for fine-grained overrides:

```tsx
import { Heading, CodeBlock, InlineCode } from "react-native-nitro-markdown";

// Works in custom renderers
<Heading level={1} style={{ color: "hotpink" }}>Title</Heading>
<CodeBlock content={code} style={{ borderRadius: 0 }} />
<InlineCode style={{ backgroundColor: "#ff0" }}>code</InlineCode>
```

### Option 7: Auto Content Extraction for Code

The `CodeBlock` and `InlineCode` components now accept a `node` prop for automatic content extraction:

```tsx
// Before: Manual extraction required
code_block: ({ node }) => (
  <CodeBlock content={getTextContent(node)} language={node.language} />
);

// After: Just pass the node
code_block: ({ node }) => <CodeBlock node={node} />;

// Or use the pre-mapped content prop (recommended)
code_block: ({ content, language }) => (
  <CodeBlock content={content} language={language} />
);
```

### Option 8: Headless (Minimal Bundle)

For maximum control, data processing, or minimal JS overhead:

```tsx
import {
  parseMarkdown,
  getTextContent,
  getFlattenedText,
} from "react-native-nitro-markdown/headless";

const ast = parseMarkdown("# Hello World");
const text = getTextContent(ast); // "Hello World"
const fullText = getFlattenedText(ast); // "Hello World\n\n" (Normalized with line breaks)
```

### Option 9: High-Performance Streaming (LLMs)

When streaming text token-by-token (e.g., from ChatGPT or Gemini), you should batch UI updates to avoid re-rendering on every token:

```tsx
import {
  MarkdownStream,
  useMarkdownSession,
} from "react-native-nitro-markdown";

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
      updateIntervalMs={60}
      updateStrategy="raf"
      useTransitionUpdates
    />
  );
}
```

**Recommended defaults for token streaming:**
- `updateStrategy="raf"` for smooth, frame-aligned updates
- `updateIntervalMs={50–100}` when using `updateStrategy="interval"`
- Avoid per-token UI updates by batching token appends

**Streaming props:**

| Prop | Type | Default | Description |
| :-- | :-- | :-- | :-- |
| `updateIntervalMs` | `number` | `50` | Throttle UI updates when using interval strategy |
| `updateStrategy` | `"interval" \| "raf"` | `"interval"` | Interval batching or frame-aligned updates |
| `useTransitionUpdates` | `boolean` | `false` | Use React transitions to keep input responsive |

### Option 10: Extracting Plain Text

You can extract the plain text representation (with proper line breaks) using the `onParseComplete` callback. This is useful for "Copy All" buttons or TTS.

```tsx
<Markdown
  onParseComplete={(result) => {
    console.log(result.text); // "Hello World\n\nThis is bold text."
    console.log(result.ast); // Full AST
  }}
>
  {markdown}
</Markdown>
```

---

## 🎨 Using Context in Custom Renderers

Access theme and context in custom renderers:

```tsx
import {
  useMarkdownContext,
  MarkdownContext,
} from "react-native-nitro-markdown";

const MyCustomRenderer = ({ children }) => {
  const { theme, stylingStrategy } = useMarkdownContext();

  return <View style={{ padding: theme.spacing.m }}>{children}</View>;
};
```

---

## 🛠️ Exported Utilities

```tsx
// Parser and utilities
export {
  parseMarkdown,
  parseMarkdownWithOptions,
  getTextContent,
  getFlattenedText,
} from "./headless";

// Theme tokens
export {
  defaultMarkdownTheme,
  minimalMarkdownTheme,
  mergeThemes,
};

// Context
export { useMarkdownContext, MarkdownContext };

// Individual renderers
export {
  Heading,
  Paragraph,
  Link,
  Blockquote,
  HorizontalRule,
  CodeBlock,
  InlineCode,
  List,
  ListItem,
  TaskListItem,
  TableRenderer,
  Image,
  MathInline,
  MathBlock,
};
```

---

## 🛠️ Headless vs. Non-Headless

| Feature         | **Headless** (`/headless`)  | **Non-Headless** (`default`)       |
| :-------------- | :-------------------------- | :--------------------------------- |
| **Logic**       | Raw C++ md4c Parser         | Parser + Full UI Renderer          |
| **Output**      | JSON AST Tree               | React Native Views                 |
| **Best For**    | Search Indexing, Custom UIs | Fast Implementation, Documentation |
| **JS Overhead** | ~4 KB                       | ~60 KB                             |

---

### Basic Parsing API

The parsing is synchronous and instant. It returns a fully typed JSON AST:

```typescript
import { parseMarkdown } from "react-native-nitro-markdown/headless";

const ast = parseMarkdown(`
# Hello World
This is **bold** text and a [link](https://github.com).
`);
```

### Options

| Option | Type      | Default | Description                                                                    |
| :----- | :-------- | :------ | :----------------------------------------------------------------------------- |
| `gfm`  | `boolean` | `false` | Enable GitHub Flavored Markdown (Tables, Strikethrough, Autolinks, TaskLists). |
| `math` | `boolean` | `false` | Enable LaTeX Math support (`$` and `$$`).                                      |

---

## 📐 AST Structure

The parser returns a `MarkdownNode` tree:

```typescript
export interface MarkdownNode {
  type: NodeType;
  content?: string;
  children?: MarkdownNode[];
  level?: number;
  href?: string;
  checked?: boolean;
  language?: string;
  align?: "left" | "center" | "right";
  isHeader?: boolean;
}
```

---

## 🧮 LaTeX Math Support

We parse math delimiters (`$` and `$$`) natively using the `MD_FLAG_LATEXMATHSPANS` flag in `md4c`.

To render the math, use a library like `react-native-mathjax-svg`:

```tsx
case 'math_inline':
  return <MathView math={node.content} style={styles.math} />;
case 'math_block':
  return <MathView math={node.content} style={styles.mathBlock} />;
```

---

## 📊 Package Size

| Metric               | Size    |
| :------------------- | :------ |
| **Packed (tarball)** | ~75 kB  |
| **Unpacked**         | ~325 kB |
| **Total files**      | 55      |

---

## 🤝 Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## 📄 License

MIT

---

Built with ❤️ using [Nitro Modules](https://nitro.margelo.com) and [md4c](https://github.com/mity/md4c).
