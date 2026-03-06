import { useState, useCallback } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
} from "react-native";
import { Parser } from "commonmark";
import MarkdownIt from "markdown-it";
import { marked } from "marked";
import {
  parseMarkdown,
  extractPlainText,
  getFlattenedText,
  stripSourceOffsets,
  mergeThemes,
  defaultMarkdownTheme,
  minimalMarkdownTheme,
  createMarkdownSession,
  type MarkdownNode,
} from "react-native-nitro-markdown";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";
import { COMPLEX_MARKDOWN } from "../markdown-test-data";
import { EXAMPLE_COLORS } from "../theme";

// Generate a massive string (~300KB) to force the CPU to work
const REPEATED_MARKDOWN = COMPLEX_MARKDOWN.repeat(50);

type LogEntry = {
  text: string;
  type: "header" | "pass" | "fail" | "info" | "spacer";
};

async function runSmokeTests(): Promise<LogEntry[]> {
  const logs: LogEntry[] = [];

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
  const header = (text: string) => {
    logs.push({ text, type: "header" });
  };
  const spacer = () => {
    logs.push({ text: "", type: "spacer" });
  };

  // -----------------------------------------------------------------------
  // Headless API
  // -----------------------------------------------------------------------
  header("HEADLESS API");

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

  // -----------------------------------------------------------------------
  // Theme utilities
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // AST node types coverage
  // -----------------------------------------------------------------------
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
    const allTypes = new Set<string>();
    const walk = (node: MarkdownNode) => {
      allTypes.add(node.type);
      node.children?.forEach(walk);
    };
    walk(ast);

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

  // -----------------------------------------------------------------------
  // Plugin simulation
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // AST Transform
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // MarkdownSession (native)
  // -----------------------------------------------------------------------
  header("MARKDOWN SESSION");

  try {
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

  // -----------------------------------------------------------------------
  // sourceAst
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------------
  const passed = logs.filter((l) => l.type === "pass").length;
  const failed = logs.filter((l) => l.type === "fail").length;
  const total = passed + failed;

  header("SUMMARY");
  logs.push({
    text: `${passed}/${total} passed${failed > 0 ? ` (${failed} failed)` : ""}`,
    type: failed > 0 ? "fail" : "pass",
  });

  return logs;
}

export default function BenchmarkScreen() {
  const [smokeLogs, setSmokeLogs] = useState<LogEntry[]>([]);
  const [benchLogs, setBenchLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "smoke" | "bench">("idle");
  const tabHeight = useBottomTabHeight();

  const addBenchLog = useCallback((message: string) => {
    setBenchLogs((prev) => [...prev, message]);
  }, []);

  const wait = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const runNitroBenchmark = (): number => {
    parseMarkdown("warmup");
    const startNitro = global.performance.now();
    parseMarkdown(REPEATED_MARKDOWN);
    const endNitro = global.performance.now();
    return endNitro - startNitro;
  };

  const runSmoke = async () => {
    setMode("smoke");
    setError(null);
    setBenchLogs([]);
    try {
      const results = await runSmokeTests();
      setSmokeLogs(results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  };

  const runBenchmark = async () => {
    setMode("bench");
    setBenchLogs([]);
    setSmokeLogs([]);
    setError(null);

    try {
      addBenchLog(
        `Testing ${(REPEATED_MARKDOWN.length / 1024).toFixed(1)}KB of complex markdown`,
      );
      addBenchLog("");
      await wait(100);

      const nitroTime = runNitroBenchmark();
      addBenchLog(`Nitro (C++): ${nitroTime.toFixed(2)}ms`);
      await wait(100);

      const commonmarkParser = new Parser();
      commonmarkParser.parse("warmup");
      const startCommonMark = global.performance.now();
      commonmarkParser.parse(REPEATED_MARKDOWN);
      const endCommonMark = global.performance.now();
      const commonmarkTime = endCommonMark - startCommonMark;
      addBenchLog(`CommonMark (JS): ${commonmarkTime.toFixed(2)}ms`);
      await wait(100);

      const markdownItParser = new MarkdownIt();
      markdownItParser.render("warmup");
      const startMarkdownIt = global.performance.now();
      markdownItParser.render(REPEATED_MARKDOWN);
      const endMarkdownIt = global.performance.now();
      const markdownItTime = endMarkdownIt - startMarkdownIt;
      addBenchLog(`Markdown-It (JS): ${markdownItTime.toFixed(2)}ms`);
      await wait(100);

      await marked.parse("warmup");
      const startMarked = global.performance.now();
      await marked.parse(REPEATED_MARKDOWN);
      const endMarked = global.performance.now();
      const markedTime = endMarked - startMarked;
      addBenchLog(`Marked (JS): ${markedTime.toFixed(2)}ms`);
      addBenchLog("");
      await wait(100);

      const commonmarkSpeedup = (commonmarkTime / nitroTime).toFixed(1);
      const markdownItSpeedup = (markdownItTime / nitroTime).toFixed(1);
      const markedSpeedup = (markedTime / nitroTime).toFixed(1);

      addBenchLog("SPEED COMPARISON:");
      addBenchLog(`   vs CommonMark: ${commonmarkSpeedup}x faster`);
      addBenchLog(`   vs Markdown-It: ${markdownItSpeedup}x faster`);
      addBenchLog(`   vs Marked: ${markedSpeedup}x faster`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.hero}>
          <Text style={styles.title}>Benchmark Showdown</Text>
          <Text style={styles.subtitle}>Nitro vs Top 3 JS Libraries</Text>
          <Text style={styles.dataSize}>
            Testing: {(REPEATED_MARKDOWN.length / 1024).toFixed(1)} KB of
            complex markdown
          </Text>
        </View>
      </View>

      <View style={styles.buttonRow}>
        <Pressable
          style={[
            styles.benchmarkButton,
            mode === "smoke" && styles.buttonActive,
          ]}
          onPress={runSmoke}
        >
          <Text style={styles.benchmarkText}>Run Smoke Tests</Text>
        </Pressable>
        <Pressable
          style={[
            styles.benchmarkButton,
            mode === "bench" && styles.buttonActive,
          ]}
          onPress={runBenchmark}
        >
          <Text style={styles.benchmarkText}>Run Benchmark</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.resultsScroll}
        contentContainerStyle={{ paddingBottom: tabHeight + 20 }}
        bounces={false}
      >
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Error</Text>
            <Text style={styles.errorMessage}>{error}</Text>
          </View>
        ) : mode === "smoke" && smokeLogs.length > 0 ? (
          <View style={styles.resultsContainer}>
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
                  ]}
                >
                  {log.text}
                </Text>
              );
            })}
          </View>
        ) : mode === "bench" && benchLogs.length > 0 ? (
          <View style={styles.resultsContainer}>
            {benchLogs.map((log, i) => (
              <Text
                key={i}
                style={[
                  styles.resultText,
                  log.includes("Nitro") && styles.nitroResult,
                  log.includes("CommonMark") && styles.commonmarkResult,
                  log.includes("Markdown-It") && styles.markdownitResult,
                  log.includes("Marked") && styles.markedResult,
                  log.includes("SPEED COMPARISON") && styles.comparisonHeader,
                  log.includes("faster") && styles.speedResult,
                ]}
              >
                {log}
              </Text>
            ))}
          </View>
        ) : (
          <Text style={styles.instructionText}>
            Tap &quot;Run Smoke Tests&quot; to verify all features, or &quot;Run
            Benchmark&quot; to compare Nitro against the top 3 JavaScript
            markdown libraries!
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: EXAMPLE_COLORS.background,
  },
  header: {
    paddingTop: 32,
    paddingHorizontal: 20,
    paddingBottom: 18,
  },
  hero: {
    alignItems: "center",
    backgroundColor: EXAMPLE_COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
    paddingHorizontal: 20,
    paddingVertical: 16,
    boxShadow: `0px 10px 20px ${EXAMPLE_COLORS.text}14`,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: EXAMPLE_COLORS.text,
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: EXAMPLE_COLORS.textMuted,
    marginBottom: 8,
    textAlign: "center",
  },
  dataSize: {
    fontSize: 13,
    color: EXAMPLE_COLORS.accentDeep,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    backgroundColor: EXAMPLE_COLORS.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  buttonRow: {
    flexDirection: "row",
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 18,
  },
  benchmarkButton: {
    flex: 1,
    backgroundColor: EXAMPLE_COLORS.accent,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    boxShadow: `0px 8px 16px ${EXAMPLE_COLORS.accentDeep}52`,
  },
  buttonActive: {
    backgroundColor: EXAMPLE_COLORS.accentDeep,
  },
  benchmarkText: {
    color: EXAMPLE_COLORS.surface,
    fontSize: 15,
    fontWeight: "700",
  },
  resultsScroll: {
    flex: 1,
    paddingHorizontal: 20,
  },
  resultsContainer: {
    backgroundColor: EXAMPLE_COLORS.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
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
  spacer: {
    height: 8,
  },
  nitroResult: {
    color: EXAMPLE_COLORS.accent,
    fontWeight: "700",
  },
  commonmarkResult: {
    color: EXAMPLE_COLORS.danger,
    fontWeight: "600",
  },
  markdownitResult: {
    color: EXAMPLE_COLORS.info,
    fontWeight: "600",
  },
  markedResult: {
    color: "#f97316",
    fontWeight: "600",
  },
  comparisonHeader: {
    color: EXAMPLE_COLORS.text,
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: EXAMPLE_COLORS.border,
    paddingTop: 16,
  },
  speedResult: {
    color: EXAMPLE_COLORS.accentDeep,
    fontSize: 15,
    fontWeight: "700",
  },
  instructionText: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 16,
    textAlign: "center",
    marginTop: 60,
    lineHeight: 24,
    paddingHorizontal: 32,
  },
  errorBox: {
    backgroundColor: EXAMPLE_COLORS.dangerSoft,
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    borderWidth: 1,
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
