<p align="center">
  <img src="./apps/example/assets/icon.png" alt="react-native-nitro-markdown logo" width="150" height="150" />
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
npx expo install react-native-nitro-markdown react-native-nitro-modules
npx expo prebuild
```

---

## 💻 Usage

### Basic Parsing

The parsing is synchronous and instant. It returns a fully typed JSON AST.

```typescript
import { parseMarkdown } from "react-native-nitro-markdown";

const markdown = `
# Hello World
This is **bold** text and a [link](https://github.com).
`;

const ast = parseMarkdown(markdown);
console.log(ast);
// Output: { type: "document", children: [...] }
```

### Advanced Options (GFM & Math)

Enable GitHub Flavored Markdown (Tables, TaskLists) or LaTeX Math support.

```typescript
import { parseMarkdown } from "react-native-nitro-markdown";

const ast = parseMarkdown(markdown, {
  gfm: true, // Tables, Strikethrough, Autolinks, TaskLists
  math: true, // $E=mc^2$ and $$block$$
  wiki: true, // [[WikiLinks]]
});
```

---

## 🎨 Rendering

This library is a **Parser Only**. It gives you the raw data (AST) so you can render it with native components (`<Text>`, `<View>`) for maximum performance.

Here is a simple recursive renderer example:

```tsx
import React from "react";
import { Text, View, StyleSheet } from "react-native";
import { parseMarkdown, type MarkdownNode } from "react-native-nitro-markdown";

export function MarkdownView({ content }: { content: string }) {
  const ast = parseMarkdown(content, { gfm: true });

  return (
    <View style={styles.container}>
      <Renderer node={ast} />
    </View>
  );
}

function Renderer({ node }: { node: MarkdownNode }) {
  switch (node.type) {
    case "document":
      return (
        <View>
          {node.children?.map((child, i) => (
            <Renderer key={i} node={child} />
          ))}
        </View>
      );

    case "heading":
      return (
        <Text style={styles.h1}>
          {node.children?.map((c, i) => (
            <Renderer key={i} node={c} />
          ))}
        </Text>
      );

    case "paragraph":
      return (
        <Text style={styles.p}>
          {node.children?.map((child, i) => (
            <Renderer key={i} node={child} />
          ))}
        </Text>
      );

    case "text":
      return <Text>{node.content}</Text>;

    case "bold":
      return (
        <Text style={styles.bold}>
          {node.children?.map((c, i) => (
            <Renderer key={i} node={c} />
          ))}
        </Text>
      );

    // Handle 'table', 'code_block', 'math_inline' etc...
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  h1: { fontSize: 24, fontWeight: "bold", marginVertical: 8 },
  p: { fontSize: 16, lineHeight: 24, marginBottom: 8 },
  bold: { fontWeight: "700" },
});
```

---

## 📐 AST Structure

The parser returns a `MarkdownNode` tree. The Types are fully exported for TypeScript support.

```typescript
export interface MarkdownNode {
  type: NodeType;
  // Content for Text/Code/Math
  content?: string;
  // Hierarchy
  children?: MarkdownNode[];
  // Metadata
  level?: number; // Headings (1-6)
  href?: string; // Links
  checked?: boolean; // Task Lists
  language?: string; // Code Blocks
  // Table Props
  align?: "left" | "center" | "right";
  isHeader?: boolean;
}

export type NodeType =
  | "document"
  | "paragraph"
  | "text"
  | "heading"
  | "bold"
  | "italic"
  | "strikethrough"
  | "link"
  | "image"
  | "code_inline"
  | "code_block"
  | "blockquote"
  | "list"
  | "list_item"
  | "task_list_item"
  | "table"
  | "table_row"
  | "table_cell"
  | "math_inline"
  | "math_block";
```

---

## 🧮 LaTeX Math Support

We parse math delimiters (`$` and `$$`) natively using the `MD_FLAG_LATEXMATHSPANS` flag in `md4c`.

To render the math, you should use a library like `react-native-math-view`, `react-native-mathjax-svg`, or `react-native-katex` inside your renderer:

```tsx
// Inside your switch(node.type)
case 'math_inline':
  return <MathView math={node.content} style={styles.math} />;
case 'math_block':
  return <MathView math={node.content} style={styles.mathBlock} />;
```

## 📊 Package Size

| Metric               | Size    |
| :------------------- | :------ |
| **Packed (tarball)** | ~75 kB  |
| **Unpacked**         | ~325 kB |
| **Total files**      | 55      |

> The package includes the [md4c](https://github.com/mity/md4c) C source code (~244 kB) which is compiled natively on iOS and Android. This is a one-time cost that enables the high-performance parsing.

---

## 🤝 Contributing

See the [contributing guide](CONTRIBUTING.md) to learn how to contribute to the repository and the development workflow.

## 📄 License

MIT

---

Built with ❤️ using [Nitro Modules](https://nitro.margelo.com) and [md4c](https://github.com/mity/md4c).
