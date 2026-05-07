import { useState, useCallback, useRef, type ComponentType } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { Parser } from "commonmark";
import MarkdownIt from "markdown-it";
import { marked } from "marked";
import {
  Markdown,
  MarkdownStream,
  parseMarkdown,
  parseMarkdownWithOptions,
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
  ExampleActionButton,
  ExamplePanel,
  ExampleScreen,
} from "../components/example-ui";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";
import { COMPLEX_MARKDOWN } from "../markdown-test-data";
import { EXAMPLE_COLORS } from "../theme";

const REPEATED_MARKDOWN = COMPLEX_MARKDOWN.repeat(50);
const LATEX_BENCH_MARKDOWN = Array.from(
  { length: 18 },
  (_, index) => `
### Formula ${index + 1}

Inline energy $E = mc^2$ and quadratic roots $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$.

$$\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6} \\qquad \\int_0^1 x^${index + 2}\\,dx = \\frac{1}{${index + 3}}$$
  `,
).join("\n");
type LogEntry = {
  text: string;
  type: "header" | "pass" | "fail" | "info" | "skip" | "spacer";
};

type LatexBenchmarkTarget = {
  renderer: "ratex" | "legacy-mathjax";
  startedAt: number;
  token: number;
};

type BenchmarkResults = {
  nitroTime: number;
  commonmarkTime: number;
  markdownItTime: number;
  markedTime: number;
  mathjaxTime: number;
  ratexTime: number;
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
  const latexBenchmarkResolverRef = useRef<((duration: number) => void) | null>(
    null,
  );

  const wait = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const runNitroBenchmark = (): number => {
    parseMarkdown("warmup");
    const startNitro = global.performance.now();
    parseMarkdown(REPEATED_MARKDOWN);
    const endNitro = global.performance.now();
    return endNitro - startNitro;
  };

  const measureLatexRenderer = (
    renderer: LatexBenchmarkTarget["renderer"],
  ): Promise<number> => {
    const startedAt = global.performance.now();
    const token = Math.random();

    return new Promise((resolve) => {
      latexBenchmarkResolverRef.current = resolve;
      setLatexBenchmarkTarget({ renderer, startedAt, token });
    });
  };

  const handleLatexBenchmarkLayout = useCallback(() => {
    const target = latexBenchmarkTarget;
    const resolve = latexBenchmarkResolverRef.current;
    if (!target || !resolve) return;

    setTimeout(() => {
      latexBenchmarkResolverRef.current = null;
      setLatexBenchmarkTarget(null);
      resolve(global.performance.now() - target.startedAt);
    }, 250);
  }, [latexBenchmarkTarget]);

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

    try {
      await wait(100);

      const nitroTime = runNitroBenchmark();
      await wait(100);

      const commonmarkParser = new Parser();
      commonmarkParser.parse("warmup");
      const startCommonMark = global.performance.now();
      commonmarkParser.parse(REPEATED_MARKDOWN);
      const endCommonMark = global.performance.now();
      const commonmarkTime = endCommonMark - startCommonMark;
      await wait(100);

      const markdownItParser = new MarkdownIt();
      markdownItParser.render("warmup");
      const startMarkdownIt = global.performance.now();
      markdownItParser.render(REPEATED_MARKDOWN);
      const endMarkdownIt = global.performance.now();
      const markdownItTime = endMarkdownIt - startMarkdownIt;
      await wait(100);

      await marked.parse("warmup");
      const startMarked = global.performance.now();
      await marked.parse(REPEATED_MARKDOWN);
      const endMarked = global.performance.now();
      const markedTime = endMarked - startMarked;
      await wait(100);

      const mathjaxTime = await measureLatexRenderer("legacy-mathjax");
      await wait(100);

      const ratexTime = await measureLatexRenderer("ratex");
      setBenchmarkResults({
        nitroTime,
        commonmarkTime,
        markdownItTime,
        markedTime,
        mathjaxTime,
        ratexTime,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setIsBenchmarkRunning(false);
    }
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
              <Text style={styles.resultGroupTitle}>Parser</Text>
              <View style={styles.metricRow}>
                <Text style={styles.metricName}>Nitro C++</Text>
                <Text style={[styles.metricValue, styles.metricPrimary]}>
                  {benchmarkResults.nitroTime.toFixed(2)}ms
                </Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metricName}>CommonMark</Text>
                <View style={styles.metricValueGroup}>
                  <Text style={styles.metricValue}>
                    {benchmarkResults.commonmarkTime.toFixed(2)}ms
                  </Text>
                  <Text style={styles.inlineSpeedTag}>
                    {(
                      benchmarkResults.commonmarkTime /
                      benchmarkResults.nitroTime
                    ).toFixed(1)}
                    x
                  </Text>
                </View>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metricName}>Markdown-It</Text>
                <View style={styles.metricValueGroup}>
                  <Text style={styles.metricValue}>
                    {benchmarkResults.markdownItTime.toFixed(2)}ms
                  </Text>
                  <Text style={styles.inlineSpeedTag}>
                    {(
                      benchmarkResults.markdownItTime /
                      benchmarkResults.nitroTime
                    ).toFixed(1)}
                    x
                  </Text>
                </View>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metricName}>Marked</Text>
                <View style={styles.metricValueGroup}>
                  <Text style={styles.metricValue}>
                    {benchmarkResults.markedTime.toFixed(2)}ms
                  </Text>
                  <Text style={styles.inlineSpeedTag}>
                    {(
                      benchmarkResults.markedTime / benchmarkResults.nitroTime
                    ).toFixed(1)}
                    x
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.resultGroup}>
              <Text style={styles.resultGroupTitle}>Math renderer</Text>
              <View style={styles.metricRow}>
                <Text style={styles.metricName}>Legacy MathJax/SVG</Text>
                <Text style={styles.metricValue}>
                  {benchmarkResults.mathjaxTime.toFixed(2)}ms
                </Text>
              </View>
              <View style={styles.metricRow}>
                <Text style={styles.metricName}>RaTeX</Text>
                <Text style={[styles.metricValue, styles.metricPrimary]}>
                  {benchmarkResults.ratexTime.toFixed(2)}ms
                </Text>
              </View>
              <View style={styles.speedBadge}>
                <Text style={styles.speedBadgeText}>
                  {(
                    benchmarkResults.mathjaxTime / benchmarkResults.ratexTime
                  ).toFixed(1)}
                  x faster
                </Text>
              </View>
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
  metricValueGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  metricPrimary: {
    color: EXAMPLE_COLORS.accentDeep,
  },
  inlineSpeedTag: {
    minWidth: 44,
    textAlign: "center",
    color: EXAMPLE_COLORS.accentDeep,
    backgroundColor: EXAMPLE_COLORS.accentSoft,
    borderRadius: 6,
    overflow: "hidden",
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 12,
    fontWeight: "800",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
  speedBadge: {
    alignSelf: "flex-start",
    backgroundColor: EXAMPLE_COLORS.accentSoft,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginTop: 8,
  },
  speedBadgeText: {
    color: EXAMPLE_COLORS.accentDeep,
    fontSize: 13,
    fontWeight: "800",
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
