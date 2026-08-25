import { useState, useCallback, useRef, type ComponentType } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import {
  Markdown,
  MarkdownStream,
  parseMarkdown,
  parseMarkdownWithOptions,
  MarkdownError,
  extractPlainText,
  extractPlainTextWithOptions,
  getFlattenedText,
  stripSourceOffsets,
  mergeThemes,
  defaultMarkdownTheme,
  minimalMarkdownTheme,
  createMarkdownSession,
  defaultHighlighter,
  type CustomRenderers,
  type MarkdownNode,
} from "react-native-nitro-markdown";
import {
  BenchBar,
  ExampleActionButton,
  ExamplePanel,
  ExampleScreen,
} from "../components/example-ui";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";
import { COMPLEX_MARKDOWN } from "../markdown-test-data";
import { EXAMPLE_COLORS } from "../theme";

const REPEATED_MARKDOWN = COMPLEX_MARKDOWN.repeat(50);
const NITRO_BENCHMARK_ITERATIONS = 12;
const LATEX_BENCH_MARKDOWN = Array.from(
  { length: 18 },
  (_, index) => `
### Formula ${index + 1}

Inline energy $E = mc^2$ and quadratic roots $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$.

$$\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6} \\qquad \\int_0^1 x^${index + 2}\\,dx = \\frac{1}{${index + 3}}$$
  `,
).join("\n");

const RENDER_BENCH_MARKDOWN = Array.from(
  { length: 3 },
  (_, index) => `
# Section ${index + 1} Heading

## Subheading with \`inline code\`

### Third-level heading

A paragraph with **bold**, *italic*, ***bold italic***, \`inline code\`, ~~strikethrough~~ and a [link](https://swmansion.com). It is long enough to wrap across several lines so layout work is non-trivial for both renderers.

> A blockquote with **bold**, *italic* and a [link](https://example.com).

- Unordered item with **emphasis**
- Unordered item with \`code\`
  - Nested item one
  - Nested item two
- Unordered item with a [link](https://example.com)

1. Ordered first
2. Ordered second
3. Ordered third

- [x] Completed task item
- [ ] Pending task item

| Feature | Status | Notes |
| --- | :---: | --- |
| Tables | yes | column alignment |
| Math | yes | inline and block |
| Lists | yes | nested supported |

\`\`\`ts
function render(value: number): string {
  return \`Section \${value}\`;
}
\`\`\`

![sample image](https://picsum.photos/seed/nitro${index}/240/120)

---
`,
).join("\n");

const LONG_RENDER_BENCH_MARKDOWN = Array.from(
  { length: 60 },
  (_, index) => `## Section ${index + 1}

Paragraph ${index + 1} with **bold**, *italic* and a [link](https://swmansion.com) that is long enough to wrap across multiple lines for realistic layout work.

- First point with \`code\`
- Second point with **emphasis**`,
).join("\n\n");

const MEASURE_SETTLE_MS = 120;
const MEASURE_TIMEOUT_MS = 3500;
const RENDER_SAMPLE_COUNT = 5;

const formatMs = (value: number | null): string =>
  value === null || Number.isNaN(value) ? "—" : `${value.toFixed(2)}ms`;

const formatRatio = (slow: number | null, fast: number | null): string =>
  slow === null ||
  fast === null ||
  Number.isNaN(slow) ||
  Number.isNaN(fast) ||
  fast === 0
    ? "—"
    : `${(slow / fast).toFixed(1)}x`;

type LogEntry = {
  text: string;
  type: "header" | "pass" | "fail" | "info" | "skip" | "spacer";
};

type LatexBenchmarkTarget = {
  renderer: "ratex" | "legacy-mathjax";
  startedAt: number;
  token: number;
};

type RenderBenchmarkTarget = {
  kind: "nitro" | "nitro-long";
  startedAt: number;
  token: number;
};

type BenchmarkResults = {
  nitroTime: number;
  nitroP50: number;
  nitroP95: number;
  nitroIterations: number;
  nitroNoOffsetsTime: number;
  nitroNoOffsetsP50: number;
  nitroNoOffsetsP95: number;
  mathjaxTime: number | null;
  ratexTime: number | null;
  nitroRenderTime: number | null;
  nitroFirstScreenTime: number | null;
};

let LegacyMathJaxComponent: ComponentType<{
  fontSize?: number;
  color?: string;
  fontCache?: boolean;
  style?: object;
  children?: string;
}> | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mathJaxModule = require("react-native-mathjax-svg");
  LegacyMathJaxComponent = mathJaxModule.default || mathJaxModule;
} catch {
  LegacyMathJaxComponent = null;
}

const legacyMathRenderers: CustomRenderers = {
  math_inline: ({ content }) => {
    if (!content || !LegacyMathJaxComponent) return null;
    return (
      <View style={styles.legacyMathInline}>
        <LegacyMathJaxComponent
          fontSize={14}
          color={EXAMPLE_COLORS.text}
          fontCache={false}
          style={styles.transparent}
        >
          {content}
        </LegacyMathJaxComponent>
      </View>
    );
  },
  math_block: ({ content }) => {
    if (!content || !LegacyMathJaxComponent) return null;
    return (
      <View style={styles.legacyMathBlock}>
        <ScrollView
          horizontal
          bounces={false}
          alwaysBounceHorizontal={false}
          overScrollMode="never"
        >
          <LegacyMathJaxComponent
            fontSize={18}
            color={EXAMPLE_COLORS.text}
            fontCache={false}
            style={styles.transparent}
          >
            {`\\displaystyle ${content}`}
          </LegacyMathJaxComponent>
        </ScrollView>
      </View>
    );
  },
};

const NATIVE_RUNTIME_PLATFORMS = ["ios", "android"] as const;

const getPercentile = (values: number[], percentile: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
};

function collectNodeTypes(ast: MarkdownNode): Set<string> {
  const allTypes = new Set<string>();
  const walk = (node: MarkdownNode) => {
    allTypes.add(node.type);
    node.children?.forEach(walk);
  };
  walk(ast);
  return allTypes;
}

async function runSmokeTests(): Promise<LogEntry[]> {
  const logs: LogEntry[] = [];
  const supportsNativeRuntime = NATIVE_RUNTIME_PLATFORMS.includes(
    Platform.OS as (typeof NATIVE_RUNTIME_PLATFORMS)[number],
  );

  const pass = (name: string, detail?: string) => {
    logs.push({
      text: `PASS  ${name}${detail ? ` — ${detail}` : ""}`,
      type: "pass",
    });
  };
  const fail = (name: string, detail?: string) => {
    logs.push({
      text: `FAIL  ${name}${detail ? ` — ${detail}` : ""}`,
      type: "fail",
    });
  };
  const info = (name: string, detail?: string) => {
    logs.push({
      text: `INFO  ${name}${detail ? ` — ${detail}` : ""}`,
      type: "info",
    });
  };
  const skip = (name: string, detail?: string) => {
    logs.push({
      text: `SKIP  ${name}${detail ? ` — ${detail}` : ""}`,
      type: "skip",
    });
  };
  const header = (text: string) => {
    logs.push({ text, type: "header" });
  };
  const spacer = () => {
    logs.push({ text: "", type: "spacer" });
  };

  header("HEADLESS API");
  info("Current platform", Platform.OS);

  try {
    const ast = parseMarkdown("# Hello\n\nWorld");
    if (ast.type === "document" && (ast.children?.length ?? 0) > 0) {
      pass(
        "parseMarkdown",
        `root=${ast.type}, children=${ast.children?.length}`,
      );
    } else {
      fail("parseMarkdown", "unexpected AST shape");
    }
  } catch (e) {
    fail("parseMarkdown", String(e));
  }

  try {
    const ast = parseMarkdownWithOptions("# Hello", { gfm: true });
    if (ast.type === "document" && (ast.children?.length ?? 0) > 0) {
      pass("parseMarkdownWithOptions");
    } else {
      fail("parseMarkdownWithOptions", "unexpected AST shape");
    }
  } catch (e) {
    fail("parseMarkdownWithOptions", String(e));
  }

  try {
    const gfmAst = parseMarkdown("| A |\n|---|\n| B |", { gfm: true });
    if (gfmAst.children?.some((c) => c.type === "table")) {
      pass("parseMarkdown + GFM tables");
    } else {
      fail("parseMarkdown + GFM tables", "no table node found");
    }
  } catch (e) {
    fail("parseMarkdown + GFM tables", String(e));
  }

  try {
    const gfmOffAst = parseMarkdown("| A |\n|---|\n| B |", { gfm: false });
    if (!collectNodeTypes(gfmOffAst).has("table")) {
      pass("parseMarkdown + GFM disabled", "table syntax stays plain");
    } else {
      fail("parseMarkdown + GFM disabled", "unexpected table node");
    }
  } catch (e) {
    fail("parseMarkdown + GFM disabled", String(e));
  }

  try {
    const mathAst = parseMarkdown("$$x^2$$", { math: true });
    if (JSON.stringify(mathAst).includes("math_block")) {
      pass("parseMarkdown + math");
    } else {
      fail("parseMarkdown + math", "no math_block node");
    }
  } catch (e) {
    fail("parseMarkdown + math", String(e));
  }

  try {
    const mathOffAst = parseMarkdown("$x^2$", { math: false });
    if (!collectNodeTypes(mathOffAst).has("math_inline")) {
      pass("parseMarkdown + math disabled", "dollar spans stay plain");
    } else {
      fail("parseMarkdown + math disabled", "unexpected math_inline node");
    }
  } catch (e) {
    fail("parseMarkdown + math disabled", String(e));
  }

  try {
    const hasOffsets = (node: MarkdownNode): boolean =>
      node.beg !== undefined ||
      node.end !== undefined ||
      (node.children?.some(hasOffsets) ?? false);
    const withOffsets = parseMarkdown("# Hello\n\nWorld");
    const leanAst = parseMarkdownWithOptions("# Hello\n\nWorld", {
      sourceOffsets: false,
    });
    if (hasOffsets(withOffsets) && !hasOffsets(leanAst)) {
      pass(
        "parseMarkdown + sourceOffsets:false",
        "beg/end omitted natively",
      );
    } else {
      fail(
        "parseMarkdown + sourceOffsets:false",
        hasOffsets(leanAst)
          ? "offsets still present"
          : "default missing offsets",
      );
    }
  } catch (e) {
    fail("parseMarkdown + sourceOffsets:false", String(e));
  }

  try {
    const htmlDefaultAst = parseMarkdown("Hello <span>inline</span>");
    const htmlDefaultTypes = collectNodeTypes(htmlDefaultAst);
    if (
      !htmlDefaultTypes.has("html_inline") &&
      !htmlDefaultTypes.has("html_block")
    ) {
      pass("parseMarkdown + HTML default", "raw HTML AST disabled");
    } else {
      fail("parseMarkdown + HTML default", "unexpected raw HTML node");
    }
  } catch (e) {
    fail("parseMarkdown + HTML default", String(e));
  }

  try {
    const htmlAst = parseMarkdown(
      "Hello <span>inline</span>\n\n<div>block</div>",
      { html: true },
    );
    const allTypes = collectNodeTypes(htmlAst);

    if (allTypes.has("html_inline") && allTypes.has("html_block")) {
      pass("parseMarkdown + HTML", "html_inline + html_block");
    } else {
      fail("parseMarkdown + HTML", "missing raw HTML nodes");
    }
  } catch (e) {
    fail("parseMarkdown + HTML", String(e));
  }

  try {
    const plain = extractPlainText("**bold** and *italic*");
    if (plain.includes("bold") && plain.includes("italic")) {
      pass("extractPlainText", `"${plain.trim().slice(0, 40)}"`);
    } else {
      fail("extractPlainText", `got "${plain.trim().slice(0, 40)}"`);
    }
  } catch (e) {
    fail("extractPlainText", String(e));
  }

  try {
    const plain = extractPlainTextWithOptions("| A |\n|---|\n| B |", {
      gfm: true,
    });
    if (plain.includes("A") && plain.includes("B")) {
      pass("extractPlainTextWithOptions", `"${plain.trim().slice(0, 40)}"`);
    } else {
      fail("extractPlainTextWithOptions", `got "${plain.trim().slice(0, 40)}"`);
    }
  } catch (e) {
    fail("extractPlainTextWithOptions", String(e));
  }

  try {
    parseMarkdownWithOptions("12345", { maxInputLength: 4 });
    fail("maxInputLength", "oversized input was accepted");
  } catch (e) {
    if (e instanceof MarkdownError && e.code === "input_too_large") {
      pass("maxInputLength", "oversized input rejected with typed error");
    } else {
      fail("maxInputLength", String(e));
    }
  }

  try {
    const ast = parseMarkdown("# Hello\n\nWorld");
    const flat = getFlattenedText(ast);
    if (flat.includes("Hello") && flat.includes("World")) {
      pass("getFlattenedText");
    } else {
      fail("getFlattenedText", `got "${flat.slice(0, 40)}"`);
    }
  } catch (e) {
    fail("getFlattenedText", String(e));
  }

  try {
    const ast = parseMarkdown("test");
    const stripped = stripSourceOffsets(ast);
    if (!("beg" in stripped) && !("end" in stripped)) {
      pass("stripSourceOffsets");
    } else {
      fail("stripSourceOffsets", "offsets still present");
    }
  } catch (e) {
    fail("stripSourceOffsets", String(e));
  }

  spacer();

  header("PLATFORM SUPPORT");

  if (supportsNativeRuntime) {
    pass("Native parser runtime", `${Platform.OS} supported`);
    pass("MarkdownSession runtime", `${Platform.OS} supported`);
    pass("Streaming runtime", `${Platform.OS} supported`);
  } else {
    skip("Native parser runtime", `${Platform.OS} is not supported by this example`);
    skip("MarkdownSession runtime", `${Platform.OS} is not supported by this example`);
    skip("Streaming runtime", `${Platform.OS} is not supported by this example`);
  }

  spacer();

  header("THEMES & STYLING");

  try {
    const merged = mergeThemes(defaultMarkdownTheme, {
      colors: { link: "#ff0000" },
      fontSizes: { h1: 40 },
    });
    if (
      merged.colors.link === "#ff0000" &&
      merged.fontSizes.h1 === 40 &&
      merged.colors.surface === defaultMarkdownTheme.colors.surface
    ) {
      pass("mergeThemes", "partial merge preserves base");
    } else {
      fail("mergeThemes", "unexpected merge result");
    }
  } catch (e) {
    fail("mergeThemes", String(e));
  }

  try {
    const merged = mergeThemes(defaultMarkdownTheme, {
      colors: { codeTokenColors: { keyword: "#ff0000" } },
    });
    if (
      merged.colors.codeTokenColors?.keyword === "#ff0000" &&
      merged.colors.codeTokenColors?.string ===
        defaultMarkdownTheme.colors.codeTokenColors?.string
    ) {
      pass("mergeThemes codeTokenColors", "partial token map preserves defaults");
    } else {
      fail("mergeThemes codeTokenColors", "partial token map replaced defaults");
    }
  } catch (e) {
    fail("mergeThemes codeTokenColors", String(e));
  }

  try {
    if (
      typeof defaultMarkdownTheme.colors.text === "string" &&
      typeof defaultMarkdownTheme.fontSizes.m === "number"
    ) {
      pass("defaultMarkdownTheme exported");
    } else {
      fail("defaultMarkdownTheme", "missing expected fields");
    }
  } catch (e) {
    fail("defaultMarkdownTheme", String(e));
  }

  try {
    if (
      minimalMarkdownTheme.spacing.m === 0 &&
      minimalMarkdownTheme.fontFamilies.regular === undefined
    ) {
      pass("minimalMarkdownTheme", "zero spacing, no font family");
    } else {
      fail("minimalMarkdownTheme", "unexpected values");
    }
  } catch (e) {
    fail("minimalMarkdownTheme", String(e));
  }

  spacer();

  header("RENDER COMPONENTS");

  try {
    if (typeof Markdown === "function") {
      pass("Markdown component export");
    } else {
      fail("Markdown component export", typeof Markdown);
    }
  } catch (e) {
    fail("Markdown component export", String(e));
  }

  try {
    if (typeof MarkdownStream === "function") {
      pass("MarkdownStream component export");
    } else {
      fail("MarkdownStream component export", typeof MarkdownStream);
    }
  } catch (e) {
    fail("MarkdownStream component export", String(e));
  }

  try {
    const tokens = defaultHighlighter("ts", "const answer = 42;");
    if (
      tokens.some((token) => token.type === "keyword") &&
      tokens.some((token) => token.type === "number")
    ) {
      pass("defaultHighlighter", `${tokens.length} tokens`);
    } else {
      fail("defaultHighlighter", "missing keyword/number tokens");
    }
  } catch (e) {
    fail("defaultHighlighter", String(e));
  }

  spacer();

  header("AST NODE COVERAGE");

  const allFeaturesMd = [
    "# H1",
    "## H2",
    "### H3",
    "**bold** *italic* ~~strike~~ `code`",
    "[link](https://example.com)",
    "![img](https://picsum.photos/1/1)",
    "> blockquote",
    "---",
    "- bullet\n- list",
    "1. ordered\n2. list",
    "- [x] done\n- [ ] todo",
    "| A | B |\n|---|---|\n| 1 | 2 |",
    "```ts\nconst x = 1;\n```",
    "$E=mc^2$",
    "$$x^2$$",
  ].join("\n\n");

  try {
    const ast = parseMarkdown(allFeaturesMd, { gfm: true, math: true });
    const allTypes = collectNodeTypes(ast);

    const expected = [
      "document",
      "heading",
      "paragraph",
      "text",
      "bold",
      "italic",
      "strikethrough",
      "code_inline",
      "link",
      "image",
      "blockquote",
      "horizontal_rule",
      "list",
      "list_item",
      "task_list_item",
      "table",
      "table_head",
      "table_body",
      "table_row",
      "table_cell",
      "code_block",
      "math_inline",
      "math_block",
    ];
    const missing = expected.filter((t) => !allTypes.has(t));
    if (missing.length === 0) {
      pass("All 23 node types present", `${allTypes.size} types`);
    } else {
      fail("Missing node types", missing.join(", "));
    }
  } catch (e) {
    fail("AST node coverage", String(e));
  }

  spacer();

  header("PLUGIN PIPELINE");

  try {
    let beforeRan = false;
    let afterRan = false;

    let md = "REPLACE_ME text";
    const beforeParse = (input: string) => {
      beforeRan = true;
      return input.replace("REPLACE_ME", "replaced");
    };
    const afterParse = (ast: MarkdownNode) => {
      afterRan = true;
      return ast;
    };

    md = beforeParse(md);
    const ast = parseMarkdown(md);
    afterParse(ast);

    if (beforeRan && md.includes("replaced")) {
      pass("beforeParse plugin", `"${md}"`);
    } else {
      fail("beforeParse plugin");
    }
    if (afterRan) {
      pass("afterParse plugin");
    } else {
      fail("afterParse plugin");
    }
  } catch (e) {
    fail("Plugin pipeline", String(e));
  }

  try {
    let caught = false;
    try {
      throw new Error("boom");
    } catch {
      caught = true;
    }
    if (caught) {
      pass("Plugin error isolation", "crash caught gracefully");
    } else {
      fail("Plugin error isolation");
    }
  } catch (e) {
    fail("Plugin error isolation", String(e));
  }

  spacer();

  header("AST TRANSFORM");

  try {
    const ast = parseMarkdown("Launch :rocket: now!");
    const walkTransform = (node: MarkdownNode): MarkdownNode => ({
      ...node,
      content:
        node.type === "text"
          ? (node.content ?? "").replace(/:rocket:/g, "[emoji]")
          : node.content,
      children: node.children?.map(walkTransform),
    });
    const transformed = walkTransform(ast);
    const text = getFlattenedText(transformed);
    if (text.includes("[emoji]")) {
      pass("astTransform", `"${text.trim()}"`);
    } else {
      fail("astTransform");
    }
  } catch (e) {
    fail("astTransform", String(e));
  }

  spacer();

  header("MARKDOWN SESSION");

  if (!supportsNativeRuntime) {
    skip("MarkdownSession methods", `${Platform.OS} is not supported`);
  } else try {
    const session = createMarkdownSession();
    session.append("Hello ");
    session.append("**world**");
    const text = session.getAllText();
    if (text === "Hello **world**") {
      pass("session.append + getAllText");
    } else {
      fail("session.append + getAllText", `got "${text}"`);
    }

    const range = session.getTextRange(0, 5);
    if (range === "Hello") {
      pass("session.getTextRange");
    } else {
      fail("session.getTextRange", `got "${range}"`);
    }

    session.reset("fresh");
    if (session.getAllText() === "fresh") {
      pass("session.reset");
    } else {
      fail("session.reset");
    }

    session.replace(0, 5, "new text");
    if (session.getAllText() === "new text") {
      pass("session.replace");
    } else {
      fail("session.replace", `got "${session.getAllText()}"`);
    }

    const listenerResult = await new Promise<{
      called: boolean;
      from: number;
      to: number;
    }>((resolve) => {
      const unsub = session.addListener((from: number, to: number) => {
        unsub();
        resolve({ called: true, from, to });
      });
      session.append("!");
      setTimeout(() => {
        resolve({ called: false, from: -1, to: -1 });
      }, 500);
    });
    if (
      listenerResult.called &&
      listenerResult.from >= 0 &&
      listenerResult.to > listenerResult.from
    ) {
      pass("session.addListener");
    } else {
      fail(
        "session.addListener",
        `called=${listenerResult.called} from=${listenerResult.from} to=${listenerResult.to}`,
      );
    }

    session.clear();
    if (session.getAllText() === "") {
      pass("session.clear");
    } else {
      fail("session.clear");
    }
  } catch (e) {
    fail("MarkdownSession", String(e));
  }

  spacer();

  header("SOURCE AST");

  try {
    const preBuilt: MarkdownNode = {
      type: "document",
      children: [
        {
          type: "heading",
          level: 3,
          children: [{ type: "text", content: "Pre-built" }],
        },
      ],
    };
    if (
      preBuilt.type === "document" &&
      preBuilt.children?.[0]?.type === "heading"
    ) {
      pass("sourceAst structure valid");
    } else {
      fail("sourceAst structure");
    }
  } catch (e) {
    fail("sourceAst", String(e));
  }

  spacer();

  const passed = logs.filter((l) => l.type === "pass").length;
  const failed = logs.filter((l) => l.type === "fail").length;
  const skipped = logs.filter((l) => l.type === "skip").length;
  const total = passed + failed;

  header("SUMMARY");
  logs.push({
    text: `${passed}/${total} passed${failed > 0 ? ` (${failed} failed)` : ""}${
      skipped > 0 ? `, ${skipped} unsupported` : ""
    }`,
    type: failed > 0 ? "fail" : "pass",
  });

  return logs;
}

export default function BenchmarkScreen() {
  const [smokeLogs, setSmokeLogs] = useState<LogEntry[]>([]);
  const [benchmarkResults, setBenchmarkResults] =
    useState<BenchmarkResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "smoke" | "bench">("idle");
  const [isBenchmarkRunning, setIsBenchmarkRunning] = useState(false);
  const [latexBenchmarkTarget, setLatexBenchmarkTarget] =
    useState<LatexBenchmarkTarget | null>(null);
  const tabHeight = useBottomTabHeight();
  const latexBenchmarkResolverRef = useRef<(() => void) | null>(null);
  const [renderBenchmarkTarget, setRenderBenchmarkTarget] =
    useState<RenderBenchmarkTarget | null>(null);
  const renderBenchmarkResolverRef = useRef<(() => void) | null>(null);

  const wait = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const runNitroBenchmark = (sourceOffsets: boolean) => {
    const parse = sourceOffsets
      ? parseMarkdown
      : (text: string) =>
          parseMarkdownWithOptions(text, { sourceOffsets: false });
    parse("warmup");
    const samples: number[] = [];

    for (let index = 0; index < NITRO_BENCHMARK_ITERATIONS; index++) {
      const startNitro = global.performance.now();
      parse(REPEATED_MARKDOWN);
      const endNitro = global.performance.now();
      samples.push(endNitro - startNitro);
    }

    const total = samples.reduce((sum, sample) => sum + sample, 0);
    return {
      average: total / samples.length,
      p50: getPercentile(samples, 50),
      p95: getPercentile(samples, 95),
      iterations: samples.length,
    };
  };

  const measureLatexRenderer = (
    renderer: LatexBenchmarkTarget["renderer"],
  ): Promise<number | null> => {
    const startedAt = global.performance.now();

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: number | null) => {
        if (settled) return;
        settled = true;
        latexBenchmarkResolverRef.current = null;
        setLatexBenchmarkTarget(null);
        resolve(value);
      };
      latexBenchmarkResolverRef.current = () =>
        finish(global.performance.now() - startedAt);
      setTimeout(() => finish(null), MEASURE_TIMEOUT_MS);
      setLatexBenchmarkTarget({ renderer, startedAt, token: Math.random() });
    });
  };

  const handleLatexBenchmarkLayout = useCallback(() => {
    const resolve = latexBenchmarkResolverRef.current;
    if (!resolve) return;
    setTimeout(resolve, MEASURE_SETTLE_MS);
  }, []);

  const measureRender = (
    kind: RenderBenchmarkTarget["kind"],
  ): Promise<number | null> => {
    const startedAt = global.performance.now();

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value: number | null) => {
        if (settled) return;
        settled = true;
        renderBenchmarkResolverRef.current = null;
        setRenderBenchmarkTarget(null);
        resolve(value);
      };
      renderBenchmarkResolverRef.current = () =>
        finish(global.performance.now() - startedAt);
      setTimeout(() => finish(null), MEASURE_TIMEOUT_MS);
      setRenderBenchmarkTarget({ kind, startedAt, token: Math.random() });
    });
  };

  const handleRenderBenchmarkLayout = useCallback(() => {
    const resolve = renderBenchmarkResolverRef.current;
    if (!resolve) return;
    setTimeout(resolve, MEASURE_SETTLE_MS);
  }, []);

  const measureRenderMedian = async (
    kind: RenderBenchmarkTarget["kind"],
  ): Promise<number | null> => {
    const samples: number[] = [];
    for (let index = 0; index < RENDER_SAMPLE_COUNT; index++) {
      const result = await measureRender(kind);
      if (result !== null) samples.push(result);
      await wait(80);
    }
    if (samples.length === 0) return null;
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)] ?? null;
  };

  const runSmoke = async () => {
    setMode("smoke");
    setError(null);
    setBenchmarkResults(null);
    setIsBenchmarkRunning(false);
    try {
      const results = await runSmokeTests();
      setSmokeLogs(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  };

  const runBenchmark = async () => {
    setMode("bench");
    setSmokeLogs([]);
    setBenchmarkResults(null);
    setError(null);
    setIsBenchmarkRunning(true);

    const isolate = async <T,>(
      run: () => T | Promise<T>,
      fallback: T,
    ): Promise<T> => {
      try {
        return await run();
      } catch {
        return fallback;
      } finally {
        await wait(60);
      }
    };

    await wait(60);

    const nitroBenchmark = await isolate(() => runNitroBenchmark(true), {
      average: NaN,
      p50: NaN,
      p95: NaN,
      iterations: 0,
    });
    const nitroNoOffsetsBenchmark = await isolate(
      () => runNitroBenchmark(false),
      {
        average: NaN,
        p50: NaN,
        p95: NaN,
        iterations: 0,
      },
    );

    const mathjaxTime = await isolate(
      () => measureLatexRenderer("legacy-mathjax"),
      null,
    );
    const ratexTime = await isolate(() => measureLatexRenderer("ratex"), null);
    const nitroRenderTime = await isolate(
      () => measureRenderMedian("nitro"),
      null,
    );
    const nitroFirstScreenTime = await isolate(
      () => measureRenderMedian("nitro-long"),
      null,
    );

    setBenchmarkResults({
      nitroTime: nitroBenchmark.average,
      nitroP50: nitroBenchmark.p50,
      nitroP95: nitroBenchmark.p95,
      nitroIterations: nitroBenchmark.iterations,
      nitroNoOffsetsTime: nitroNoOffsetsBenchmark.average,
      nitroNoOffsetsP50: nitroNoOffsetsBenchmark.p50,
      nitroNoOffsetsP95: nitroNoOffsetsBenchmark.p95,
      mathjaxTime,
      ratexTime,
      nitroRenderTime,
      nitroFirstScreenTime,
    });
    setIsBenchmarkRunning(false);
  };

  return (
    <ExampleScreen paddingBottom={0} style={styles.screenContent}>
      <View style={styles.buttonRow}>
        <ExampleActionButton
          active={mode === "smoke"}
          style={styles.benchmarkButton}
          onPress={runSmoke}
        >
          Run Smoke Tests
        </ExampleActionButton>
        <ExampleActionButton
          active={mode === "bench"}
          style={styles.benchmarkButton}
          onPress={runBenchmark}
        >
          Run Benchmark
        </ExampleActionButton>
      </View>

      <ScrollView
        style={styles.resultsScroll}
        contentContainerStyle={{ paddingBottom: tabHeight + 20 }}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
      >
        {error ? (
          <ExamplePanel style={styles.errorBox}>
            <Text style={styles.errorTitle}>Error</Text>
            <Text style={styles.errorMessage}>{error}</Text>
          </ExamplePanel>
        ) : mode === "smoke" && smokeLogs.length > 0 ? (
          <ExamplePanel style={styles.resultsContainer}>
            {smokeLogs.map((log, i) => {
              if (log.type === "spacer")
                return <View key={i} style={styles.spacer} />;
              return (
                <Text
                  key={i}
                  style={[
                    styles.resultText,
                    log.type === "header" && styles.logHeader,
                    log.type === "pass" && styles.logPass,
                    log.type === "fail" && styles.logFail,
                    log.type === "info" && styles.logInfo,
                    log.type === "skip" && styles.logSkip,
                  ]}
                >
                  {log.text}
                </Text>
              );
            })}
          </ExamplePanel>
        ) : mode === "bench" && benchmarkResults ? (
          <ExamplePanel style={styles.resultsContainer}>
            <View style={styles.sectionHeader}>
              <Text style={styles.resultsTitle}>Latest run</Text>
              <Text style={styles.sectionMeta}>
                {(REPEATED_MARKDOWN.length / 1024).toFixed(0)}KB markdown
              </Text>
            </View>

            <View style={styles.resultGroup}>
              <Text style={styles.resultGroupTitle}>
                Parse · {(REPEATED_MARKDOWN.length / 1024).toFixed(0)}KB document
              </Text>
              <Text style={styles.metricNote}>
                Nitro-only device measurement. JavaScript baselines run in
                isolated Node workers with a separate fixture record.
              </Text>
              <BenchBar
                label="Nitro C++"
                ms={benchmarkResults.nitroTime}
                maxMs={Math.max(benchmarkResults.nitroTime, benchmarkResults.nitroNoOffsetsTime ?? 0)}
                highlight
              />
              <BenchBar
                label="Nitro C++ · no offsets"
                ms={benchmarkResults.nitroNoOffsetsTime ?? 0}
                maxMs={Math.max(benchmarkResults.nitroTime, benchmarkResults.nitroNoOffsetsTime ?? 0)}
                ratio={`${formatRatio(benchmarkResults.nitroTime, benchmarkResults.nitroNoOffsetsTime ?? 0)}`}
              />
              <Text style={styles.metricNote}>
                Nitro p50 / p95 over {benchmarkResults.nitroIterations} runs:{" "}
                {benchmarkResults.nitroP50.toFixed(1)} /{" "}
                {benchmarkResults.nitroP95.toFixed(1)}ms.
              </Text>
              <Text style={styles.metricNote}>
                No-offset p50 / p95: {(benchmarkResults.nitroNoOffsetsP50 ?? 0).toFixed(1)} /{" "}
                {(benchmarkResults.nitroNoOffsetsP95 ?? 0).toFixed(1)}ms. This is the renderer fast path; public parse defaults retain offsets.
              </Text>
            </View>

            <View style={styles.resultGroup}>
              <Text style={styles.resultGroupTitle}>Math renderer</Text>
              <BenchBar
                label="RaTeX"
                ms={benchmarkResults.ratexTime ?? 0}
                maxMs={benchmarkResults.mathjaxTime ?? 1}
                highlight
              />
              <BenchBar
                label="Legacy MathJax/SVG"
                ms={benchmarkResults.mathjaxTime ?? 0}
                maxMs={benchmarkResults.mathjaxTime ?? 1}
                ratio={`${formatRatio(benchmarkResults.mathjaxTime, benchmarkResults.ratexTime)}`}
              />
            </View>

            <View style={styles.resultGroup}>
              <Text style={styles.resultGroupTitle}>Render · mount → layout</Text>
              <View style={styles.metricRow}>
                <Text style={styles.metricName}>Nitro Markdown</Text>
                <Text style={[styles.metricValue, styles.metricPrimary]}>
                  {formatMs(benchmarkResults.nitroRenderTime)}
                </Text>
              </View>
              <Text style={styles.metricNote}>
                Real React components, themeable and overridable per node —
                rendered synchronously on mount.
              </Text>
            </View>

            <View style={styles.resultGroup}>
              <Text style={styles.resultGroupTitle}>
                First screen · long doc (60 sections)
              </Text>
              <View style={styles.metricRow}>
                <Text style={styles.metricName}>Nitro (virtualized)</Text>
                <Text style={[styles.metricValue, styles.metricPrimary]}>
                  {formatMs(benchmarkResults.nitroFirstScreenTime)}
                </Text>
              </View>
              <Text style={styles.metricNote}>
                Nitro virtualizes long documents, mounting only the visible
                screen so first-paint stays fast regardless of length.
              </Text>
            </View>
          </ExamplePanel>
        ) : mode === "bench" && isBenchmarkRunning ? (
          <ExamplePanel style={styles.resultsContainer}>
            <Text style={styles.pendingText}>Running benchmark...</Text>
          </ExamplePanel>
        ) : (
          <ExamplePanel style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No run yet</Text>
            <Text style={styles.emptyText}>
              Run the benchmark to compare parsers and math renderers.
            </Text>
          </ExamplePanel>
        )}

      </ScrollView>

      {latexBenchmarkTarget ? (
        <View
          key={`${latexBenchmarkTarget.renderer}-${latexBenchmarkTarget.token}`}
          pointerEvents="none"
          style={styles.latexBenchmarkHost}
          onLayout={handleLatexBenchmarkLayout}
        >
          <Markdown
            options={{ gfm: true, math: true }}
            renderers={
              latexBenchmarkTarget.renderer === "legacy-mathjax"
                ? legacyMathRenderers
                : undefined
            }
          >
            {LATEX_BENCH_MARKDOWN}
          </Markdown>
        </View>
      ) : null}

      {renderBenchmarkTarget ? (
        <View
          key={`${renderBenchmarkTarget.kind}-${renderBenchmarkTarget.token}`}
          pointerEvents="none"
          style={styles.latexBenchmarkHost}
          onLayout={handleRenderBenchmarkLayout}
        >
          {renderBenchmarkTarget.kind === "nitro" ? (
            <Markdown options={{ gfm: true }}>{RENDER_BENCH_MARKDOWN}</Markdown>
          ) : (
            <Markdown
              options={{ gfm: true }}
              virtualize={true}
              style={styles.renderViewport}
            >
              {LONG_RENDER_BENCH_MARKDOWN}
            </Markdown>
          )}
        </View>
      ) : null}
    </ExampleScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    paddingTop: 20,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },
  benchmarkButton: {
    flex: 1,
  },
  resultsScroll: {
    flex: 1,
  },
  latexBenchmarkHost: {
    position: "absolute",
    left: -10000,
    top: 0,
    width: 360,
    opacity: 0,
  },
  renderViewport: {
    height: 640,
  },
  transparent: {
    backgroundColor: "transparent",
  },
  legacyMathInline: {
    marginHorizontal: 2,
    justifyContent: "center",
  },
  legacyMathBlock: {
    width: "100%",
    marginVertical: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: EXAMPLE_COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
    overflow: "hidden",
  },
  resultsContainer: {
    marginBottom: 12,
  },
  resultText: {
    fontSize: 13,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    marginBottom: 6,
    lineHeight: 20,
    color: EXAMPLE_COLORS.textMuted,
  },
  logHeader: {
    color: EXAMPLE_COLORS.text,
    fontSize: 13,
    fontWeight: "bold",
    marginTop: 4,
    marginBottom: 6,
  },
  logPass: {
    color: "#059669",
  },
  logFail: {
    color: EXAMPLE_COLORS.danger,
    fontWeight: "700",
  },
  logInfo: {
    color: EXAMPLE_COLORS.info,
  },
  logSkip: {
    color: EXAMPLE_COLORS.textMuted,
    opacity: 0.55,
    textDecorationLine: "line-through",
  },
  spacer: {
    height: 8,
  },
  emptyState: {
    marginBottom: 12,
  },
  emptyTitle: {
    color: EXAMPLE_COLORS.text,
    fontSize: 15,
    fontWeight: "800",
    marginBottom: 4,
  },
  emptyText: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  pendingText: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 14,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  sectionMeta: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 12,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
  resultsTitle: {
    color: EXAMPLE_COLORS.text,
    fontSize: 16,
    fontWeight: "800",
  },
  resultGroup: {
    borderTopWidth: 1,
    borderTopColor: EXAMPLE_COLORS.border,
    paddingTop: 12,
    marginTop: 12,
  },
  resultGroupTitle: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  metricRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
  },
  metricName: {
    color: EXAMPLE_COLORS.text,
    fontSize: 14,
    flexShrink: 1,
  },
  metricValue: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 14,
    fontWeight: "700",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
  metricPrimary: {
    color: EXAMPLE_COLORS.accentDeep,
  },
  metricNote: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 8,
  },
  errorBox: {
    backgroundColor: EXAMPLE_COLORS.dangerSoft,
    marginTop: 20,
    borderColor: EXAMPLE_COLORS.dangerBorder,
  },
  errorTitle: {
    color: EXAMPLE_COLORS.danger,
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  errorMessage: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 13,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
});
