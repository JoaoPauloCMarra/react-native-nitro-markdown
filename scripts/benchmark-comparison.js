#!/usr/bin/env node

/**
 * React Native Markdown Parser Performance Comparison
 *
 * This script benchmarks top JavaScript markdown parsers to establish
 * a baseline for comparison with the C++ Nitro implementation.
 *
 * Note: The actual Nitro (C++) benchmark runs in React Native.
 * This script demonstrates JS parser performance in Node.js.
 */

const crypto = require("crypto");
const { createRequire } = require("module");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const packageRoot = path.join(
  repoRoot,
  "packages",
  "react-native-nitro-markdown",
);
const packageManifest = require(path.join(packageRoot, "package.json"));
const packageRequire = createRequire(path.join(packageRoot, "package.json"));

if (packageManifest.name !== "react-native-nitro-markdown") {
  throw new Error(
    `Benchmark setup failed: expected react-native-nitro-markdown, got ${packageManifest.name}.`,
  );
}

// Complex markdown test data (same as used in the app)
const COMPLEX_MARKDOWN = `# 🚀 Nitro Markdown Comprehensive Demo

Welcome to the **high-performance** markdown parser powered by \`md4c\` and **Nitro Modules**.

## 📝 Complete Feature Showcase

This parser supports **every** markdown feature you'd expect and more!

### Basic Text Formatting

- **Bold text** with double asterisks
- *Italic text* with single asterisks
- ***Bold italic*** with triple asterisks
- ~~Strikethrough text~~ (GFM)
- \`Inline code\` snippets
- Combined: **bold with *italic* and \`code\`**

### Links and Images

#### Links
- [Basic link](https://github.com)
- [Link with title](https://github.com "GitHub Repository")
- [Reference style][ref-link]

#### Images
- ![Basic image](https://via.placehold.co/150 "Placeholder")
- ![Image with alt](https://via.placehold.co/100x50/FF0000/FFFFFF?text=Red "Red rectangle")

### Advanced Tables (GFM)

#### Table with All Alignments
| Left Aligned | Center Aligned | Right Aligned | Default |
|:-------------|:--------------:|--------------:|---------|
| Left 1       | Center 1       | Right 1       | Default 1 |
| Left 2       | Center 2       | Right 2       | Default 2 |
| **Bold**     | *Italic*       | \`Code\`      | ~~Strike~~ |

#### Complex Table Content
| Feature | Description | Status |
|:--------|:------------|:-------|
| JSI Binding | Direct JS ↔️ C++ | ✅ |
| Native Threading | Background processing | ✅ |
| Zero-Copy | No data duplication | ✅ |
| Math Support | LaTeX expressions | ✅ |
| GFM Tables | Advanced tables | ✅ |

### Task Lists (GFM)

- [x] Implement md4c parser
- [x] Create Nitro bindings
- [x] Build AST converter
- [x] Add comprehensive tests
- [ ] Add syntax highlighting
- [ ] Implement caching
- [ ] Add custom renderers

### Code Blocks with Languages

#### TypeScript
\`\`\`typescript
import { parseMarkdown, parseMarkdownWithOptions } from 'react-native-nitro-markdown';

interface ParserOptions {
  gfm?: boolean;
  math?: boolean;
}

const parseWithGFM = (text: string): MarkdownNode => {
  return parseMarkdownWithOptions(text, {
    gfm: true,
    math: true
  });
};
\`\`\`

#### C++ (Native Implementation)
\`\`\`cpp
#include "MD4CParser.hpp"

std::shared_ptr<MarkdownNode> parseMarkdown(
    const std::string& text,
    const ParserOptions& options
) {
    MD4CParser parser;
    return parser.parse(text, options);
}
\`\`\`

### Advanced Math Support (LaTeX)

#### Inline Math
- Simple: $E = mc^2$
- Complex: $\\frac{d}{dx}[x^n] = nx^{n-1}$
- Greek letters: $\\alpha + \\beta = \\gamma$

#### Block Math (Display Mode)
The quadratic formula:

$$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$

### Blockquotes (All Levels)

#### Single Level
> "Any sufficiently advanced technology is indistinguishable from magic."
>
> — Arthur C. Clarke

#### Nested Blockquotes
> First level quote
>
> > Second level quote
> >
> > > Third level quote
> > > With multiple lines
> >
> > Back to second level
>
> Back to first level

### Lists (Ordered & Unordered)

#### Unordered Lists
- Simple item
- **Bold item**
- *Italic item*
- \`Code item\`
- [Link item](https://example.com)
- ~~Strikethrough item~~

#### Ordered Lists
1. First ordered item
2. Second ordered item
   - Nested unordered
   - Another nested
3. Third item
   1. Nested ordered
   2. Another nested ordered
      - Deep nesting
      - More deep nesting

### Horizontal Rules

Content above

---

Content below

### Unicode and Emoji Support

#### International Characters
- Español: Hola mundo 🌍
- Français: Bonjour le monde 🌟
- Deutsch: Hallo Welt 🚀
- 中文: 你好世界 💻
- 日本語: こんにちは世界 🎌

---

[ref-link]: https://github.com/margelo/react-native-nitro-modules "Nitro Modules"
`;

// Keep this fixture stable. The device benchmark has a separate fixture and is
// never merged into this Node result automatically.
const REPEATED_MARKDOWN = COMPLEX_MARKDOWN.repeat(50);
const FIXTURE = {
  id: "node-complex-markdown-v1",
  utf8Bytes: Buffer.byteLength(REPEATED_MARKDOWN, "utf8"),
  sha256: crypto.createHash("sha256").update(REPEATED_MARKDOWN).digest("hex"),
};
const PARSERS = [
  { id: "commonmark", label: "CommonMark.js" },
  { id: "markdown-it", label: "Markdown-It" },
  { id: "marked", label: "Marked" },
];
const WARMUP_SAMPLES = 3;
const MEASURED_SAMPLES = 10;

function percentile(values, percentileValue) {
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * percentileValue;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

function getParser(parserId) {
  if (parserId === "commonmark") {
    const { Parser } = packageRequire("commonmark");
    const parser = new Parser();
    return () => parser.parse(REPEATED_MARKDOWN);
  }

  if (parserId === "markdown-it") {
    const MarkdownIt = packageRequire("markdown-it");
    const parser = new MarkdownIt();
    return () => parser.render(REPEATED_MARKDOWN);
  }

  if (parserId === "marked") {
    const { marked } = packageRequire("marked");
    return () => marked.parse(REPEATED_MARKDOWN);
  }

  throw new Error(`Unknown parser worker: ${parserId}`);
}

async function runWorker(parserId) {
  const parse = getParser(parserId);
  for (let index = 0; index < WARMUP_SAMPLES; index += 1) {
    await parse();
  }

  const samples = [];
  for (let index = 0; index < MEASURED_SAMPLES; index += 1) {
    const start = performance.now();
    const result = await parse();
    if (result == null || result === "") {
      throw new Error(`${parserId} returned an empty result`);
    }
    samples.push(performance.now() - start);
  }

  const totalMs = samples.reduce((sum, sample) => sum + sample, 0);
  return {
    parser: parserId,
    meanMs: totalMs / samples.length,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    minMs: Math.min(...samples),
    maxMs: Math.max(...samples),
    warmupSamples: WARMUP_SAMPLES,
    measuredSamples: MEASURED_SAMPLES,
  };
}

function runComparison() {
  const results = PARSERS.map(({ id }) => {
    const child = spawnSync(process.execPath, [__filename, "--worker", id], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
      env: {
        ...process.env,
        NODE_ENV: "production",
        NITRO_MARKDOWN_BENCHMARK_WORKER: "1",
      },
    });

    if (child.status !== 0) {
      throw new Error(
        `${id} benchmark worker failed with exit code ${child.status}: ${child.stderr || child.stdout}`,
      );
    }

    const output = child.stdout.trim();
    const result = JSON.parse(output.split(/\r?\n/).at(-1));
    return {
      ...result,
      label: PARSERS.find((parser) => parser.id === id).label,
    };
  });

  const result = {
    package: packageManifest.name,
    version: packageManifest.version,
    benchmark: "javascript-parser-baseline",
    scope: "node-one-process-per-parser",
    fixture: FIXTURE,
    runtime: process.version,
    platform: process.platform,
    architecture: process.arch,
    parsers: results,
  };

  console.log("JavaScript Markdown parser baseline");
  console.log(`Package: ${result.package}@${result.version}`);
  console.log(
    `Fixture: ${FIXTURE.id}, ${FIXTURE.utf8Bytes} UTF-8 bytes, sha256=${FIXTURE.sha256}`,
  );
  console.log(
    "Isolation: each parser ran sequentially in its own fresh Node process; Nitro device results are not merged into this command.",
  );
  console.log("");
  console.log("| Parser | Mean | P50 | P95 | Samples |");
  console.log("| --- | ---: | ---: | ---: | ---: |");
  for (const parser of results) {
    console.log(
      `| ${parser.label} | ${parser.meanMs.toFixed(2)}ms | ${parser.p50Ms.toFixed(2)}ms | ${parser.p95Ms.toFixed(2)}ms | ${parser.measuredSamples} |`,
    );
  }
  console.log(
    "\nUse the React Native example benchmark separately for Nitro device timing. Its fixture and runtime are intentionally reported as a different benchmark record.",
  );
  console.log(`BENCHMARK_RESULT ${JSON.stringify(result)}`);
}

if (require.main === module) {
  if (process.argv[2] === "--worker") {
    runWorker(process.argv[3])
      .then((result) => console.log(JSON.stringify(result)))
      .catch((error) => {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      });
  } else {
    runComparison();
  }
}

module.exports = { runComparison };
