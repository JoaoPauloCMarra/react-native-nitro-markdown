import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type ComponentType,
} from "react";
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
import { useLocalSearchParams } from "expo-router";
import { mathRenderers } from "react-native-nitro-markdown/math";
import { collectNodeTypes, hasSourceOffsets } from "../../ast-utils";
import {
  BenchBar,
  ExampleActionButton,
  ExamplePanel,
  ExampleScreen,
} from "../../components/example-ui";
import { MarkdownPipelineSmoke } from "../../components/markdown-pipeline-smoke";
import { E2eGate } from "../../components/e2e-gate";
import { useBottomTabHeight } from "../../hooks/use-bottom-tab-height";
import { COMPLEX_MARKDOWN } from "../../markdown-test-data";
import { EXAMPLE_COLORS } from "../../theme";

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
  type: "header" | "pass" | "fail" | "info" | "skip" | "spacer" | "summary";
  failed?: boolean;
};

const countLogs = (logs: readonly LogEntry[], type: LogEntry["type"]): number =>
  logs.filter((log) => log.type === type).length;

type LatexBenchmarkRenderer = "ratex" | "legacy-mathjax";
type RenderBenchmarkKind = "nitro" | "nitro-long";

function useLayoutTimer<Payload>() {
  const [target, setTarget] = useState<{
    payload: Payload;
    token: number;
  } | null>(null);
  const resolverRef = useRef<((layoutAt: number) => void) | null>(null);

  const measure = useCallback((payload: Payload): Promise<number | null> => {
    const startedAt = global.performance.now();

    return new Promise((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => finish(null), MEASURE_TIMEOUT_MS);
      const finish = (value: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolverRef.current = null;
        setTarget(null);
        resolve(value);
      };
      resolverRef.current = (layoutAt: number) => finish(layoutAt - startedAt);
      setTarget({ payload, token: Math.random() });
    });
  }, []);

  const onLayout = useCallback(() => {
    const resolve = resolverRef.current;
    if (!resolve) return;
    const layoutAt = global.performance.now();
    setTimeout(() => resolve(layoutAt), MEASURE_SETTLE_MS);
  }, []);

  return { target, measure, onLayout };
}

type ParseStats = {
  average: number;
  p50: number;
  p95: number;
  iterations: number;
};

type BenchmarkResults = {
  nitro: ParseStats | null;
  nitroNoOffsets: ParseStats | null;
  stepErrors: string[];
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

class SmokeFailure {
  constructor(readonly detail?: string) {}
}

type SmokeOutcome = string | void | SmokeFailure;

const verdict = (
  ok: boolean,
  passDetail?: string,
  failDetail?: string,
): SmokeOutcome => (ok ? passDetail : new SmokeFailure(failDetail));

function createSmokeLog() {
  const logs: LogEntry[] = [];
  const line =
    (label: string, type: "pass" | "fail" | "info" | "skip") =>
    (name: string, detail?: string) => {
      logs.push({ text: `${label}  ${name}${detail ? ` — ${detail}` : ""}`, type });
    };
  const pass = line("PASS", "pass");
  const fail = line("FAIL", "fail");
  const info = line("INFO", "info");
  const skip = line("SKIP", "skip");
  const header = (text: string) => {
    logs.push({ text, type: "header" });
  };
  const spacer = () => {
    logs.push({ text: "", type: "spacer" });
  };
  const check = async (
    name: string,
    run: () => SmokeOutcome | Promise<SmokeOutcome>,
  ) => {
    try {
      const outcome = await run();
      if (outcome instanceof SmokeFailure) fail(name, outcome.detail);
      else pass(name, typeof outcome === "string" ? outcome : undefined);
    } catch (e) {
      fail(name, String(e));
    }
  };
  return { logs, pass, fail, info, skip, header, spacer, check };
}

async function runSmokeTests(): Promise<LogEntry[]> {
  const { logs, pass, fail, info, skip, header, spacer, check } =
    createSmokeLog();
  const supportsNativeRuntime = NATIVE_RUNTIME_PLATFORMS.includes(
    Platform.OS as (typeof NATIVE_RUNTIME_PLATFORMS)[number],
  );

  header("HEADLESS API");
  info("Current platform", Platform.OS);

  await check("parseMarkdown", () => {
    const ast = parseMarkdown("# Hello\n\nWorld");
    return verdict(
      ast.type === "document" && (ast.children?.length ?? 0) > 0,
      `root=${ast.type}, children=${ast.children?.length}`,
      "unexpected AST shape",
    );
  });

  await check("parseMarkdownWithOptions", () => {
    const ast = parseMarkdownWithOptions("# Hello", { gfm: true });
    return verdict(
      ast.type === "document" && (ast.children?.length ?? 0) > 0,
      undefined,
      "unexpected AST shape",
    );
  });

  await check("parseMarkdown + GFM tables", () => {
    const gfmAst = parseMarkdown("| A |\n|---|\n| B |", { gfm: true });
    return verdict(
      gfmAst.children?.some((c) => c.type === "table") ?? false,
      undefined,
      "no table node found",
    );
  });

  await check("parseMarkdown + GFM disabled", () => {
    const gfmOffAst = parseMarkdown("| A |\n|---|\n| B |", { gfm: false });
    return verdict(
      !collectNodeTypes(gfmOffAst).has("table"),
      "table syntax stays plain",
      "unexpected table node",
    );
  });

  await check("parseMarkdown + math", () => {
    const mathAst = parseMarkdown("$$x^2$$", { math: true });
    return verdict(
      JSON.stringify(mathAst).includes("math_block"),
      undefined,
      "no math_block node",
    );
  });

  await check("parseMarkdown + math disabled", () => {
    const mathOffAst = parseMarkdown("$x^2$", { math: false });
    return verdict(
      !collectNodeTypes(mathOffAst).has("math_inline"),
      "dollar spans stay plain",
      "unexpected math_inline node",
    );
  });

  await check("parseMarkdown + sourceOffsets:false", () => {
    const withOffsets = parseMarkdown("# Hello\n\nWorld");
    const leanAst = parseMarkdownWithOptions("# Hello\n\nWorld", {
      sourceOffsets: false,
    });
    return verdict(
      hasSourceOffsets(withOffsets) && !hasSourceOffsets(leanAst),
      "beg/end omitted natively",
      hasSourceOffsets(leanAst)
        ? "offsets still present"
        : "default missing offsets",
    );
  });

  await check("parseMarkdown + HTML default", () => {
    const htmlDefaultTypes = collectNodeTypes(
      parseMarkdown("Hello <span>inline</span>"),
    );
    return verdict(
      !htmlDefaultTypes.has("html_inline") &&
        !htmlDefaultTypes.has("html_block"),
      "raw HTML AST disabled",
      "unexpected raw HTML node",
    );
  });

  await check("parseMarkdown + HTML", () => {
    const allTypes = collectNodeTypes(
      parseMarkdown("Hello <span>inline</span>\n\n<div>block</div>", {
        html: true,
      }),
    );
    return verdict(
      allTypes.has("html_inline") && allTypes.has("html_block"),
      "html_inline + html_block",
      "missing raw HTML nodes",
    );
  });

  await check("extractPlainText", () => {
    const plain = extractPlainText("**bold** and *italic*");
    const excerpt = plain.trim().slice(0, 40);
    return verdict(
      plain.includes("bold") && plain.includes("italic"),
      `"${excerpt}"`,
      `got "${excerpt}"`,
    );
  });

  await check("extractPlainTextWithOptions", () => {
    const plain = extractPlainTextWithOptions("| A |\n|---|\n| B |", {
      gfm: true,
    });
    const excerpt = plain.trim().slice(0, 40);
    return verdict(
      plain.includes("A") && plain.includes("B"),
      `"${excerpt}"`,
      `got "${excerpt}"`,
    );
  });

  await check("maxInputLength", () => {
    try {
      parseMarkdownWithOptions("12345", { maxInputLength: 4 });
    } catch (e) {
      return e instanceof MarkdownError && e.code === "input_too_large"
        ? "oversized input rejected with typed error"
        : new SmokeFailure(String(e));
    }
    return new SmokeFailure("oversized input was accepted");
  });

  await check("getFlattenedText", () => {
    const flat = getFlattenedText(parseMarkdown("# Hello\n\nWorld"));
    return verdict(
      flat.includes("Hello") && flat.includes("World"),
      undefined,
      `got "${flat.slice(0, 40)}"`,
    );
  });

  await check("stripSourceOffsets", () => {
    const stripped = stripSourceOffsets(parseMarkdown("test"));
    return verdict(
      !("beg" in stripped) && !("end" in stripped),
      undefined,
      "offsets still present",
    );
  });

  spacer();

  header("PLATFORM SUPPORT");

  for (const feature of [
    "Native parser runtime",
    "MarkdownSession runtime",
    "Streaming runtime",
  ]) {
    if (supportsNativeRuntime) pass(feature, `${Platform.OS} supported`);
    else skip(feature, `${Platform.OS} is not supported by this example`);
  }

  spacer();

  header("THEMES & STYLING");

  await check("mergeThemes", () => {
    const merged = mergeThemes(defaultMarkdownTheme, {
      colors: { link: "#ff0000" },
      fontSizes: { h1: 40 },
    });
    return verdict(
      merged.colors.link === "#ff0000" &&
        merged.fontSizes.h1 === 40 &&
        merged.colors.surface === defaultMarkdownTheme.colors.surface,
      "partial merge preserves base",
      "unexpected merge result",
    );
  });

  await check("mergeThemes codeTokenColors", () => {
    const merged = mergeThemes(defaultMarkdownTheme, {
      colors: { codeTokenColors: { keyword: "#ff0000" } },
    });
    return verdict(
      merged.colors.codeTokenColors?.keyword === "#ff0000" &&
        merged.colors.codeTokenColors?.string ===
          defaultMarkdownTheme.colors.codeTokenColors?.string,
      "partial token map preserves defaults",
      "partial token map replaced defaults",
    );
  });

  await check("defaultMarkdownTheme exported", () =>
    verdict(
      typeof defaultMarkdownTheme.colors.text === "string" &&
        typeof defaultMarkdownTheme.fontSizes.m === "number",
      undefined,
      "missing expected fields",
    ),
  );

  await check("minimalMarkdownTheme", () =>
    verdict(
      minimalMarkdownTheme.spacing.m === 0 &&
        minimalMarkdownTheme.fontFamilies.regular === undefined,
      "zero spacing, no font family",
      "unexpected values",
    ),
  );

  spacer();

  header("RENDER COMPONENTS");

  await check("Markdown component export", () =>
    verdict(typeof Markdown === "function", undefined, typeof Markdown),
  );

  await check("MarkdownStream component export", () =>
    verdict(
      typeof MarkdownStream === "function",
      undefined,
      typeof MarkdownStream,
    ),
  );

  await check("defaultHighlighter", () => {
    const tokens = defaultHighlighter("ts", "const answer = 42;");
    return verdict(
      tokens.some((token) => token.type === "keyword") &&
        tokens.some((token) => token.type === "number"),
      `${tokens.length} tokens`,
      "missing keyword/number tokens",
    );
  });

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
    "a  \nb\nc",
  ].join("\n\n");

  const expectedNodeTypes = [
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
    "line_break",
    "soft_break",
  ];

  await check(`All ${expectedNodeTypes.length} node types present`, () => {
    const allTypes = collectNodeTypes(
      parseMarkdown(allFeaturesMd, { gfm: true, math: true }),
    );
    const missing = expectedNodeTypes.filter((t) => !allTypes.has(t));
    return verdict(
      missing.length === 0,
      `${allTypes.size} types`,
      `missing ${missing.join(", ")}`,
    );
  });

  spacer();

  header("PLUGIN PIPELINE");
  info(
    "Rendered Markdown fixture",
    "Check the fixture status below for plugin priority, output, error phase, and continuation.",
  );

  spacer();

  header("AST TRANSFORM");

  await check("astTransform", () => {
    const ast = parseMarkdown("Launch :rocket: now!");
    const walkTransform = (node: MarkdownNode): MarkdownNode => ({
      ...node,
      content:
        node.type === "text"
          ? (node.content ?? "").replace(/:rocket:/g, "[emoji]")
          : node.content,
      children: node.children?.map(walkTransform),
    });
    const text = getFlattenedText(walkTransform(ast));
    return verdict(text.includes("[emoji]"), `"${text.trim()}"`);
  });

  spacer();

  header("MARKDOWN SESSION");

  if (!supportsNativeRuntime) {
    skip("MarkdownSession methods", `${Platform.OS} is not supported`);
  } else {
    try {
      const session = createMarkdownSession();
      try {
        session.append("Hello ");
        session.append("**world**");
        await check("session.append + getAllText", () => {
          const text = session.getAllText();
          return verdict(
            text === "Hello **world**",
            undefined,
            `got "${text}"`,
          );
        });

        await check("session.getTextRange", () => {
          const range = session.getTextRange(0, 5);
          return verdict(range === "Hello", undefined, `got "${range}"`);
        });

        await check("session.reset", () => {
          session.reset("fresh");
          return verdict(session.getAllText() === "fresh");
        });

        await check("session.replace", () => {
          session.replace(0, 5, "new text");
          return verdict(
            session.getAllText() === "new text",
            undefined,
            `got "${session.getAllText()}"`,
          );
        });

        await check("session.addListener", async () => {
          const listenerResult = await new Promise<{
            called: boolean;
            from: number;
            to: number;
          }>((resolve) => {
            const unsub = session.addListener((from: number, to: number) => {
              clearTimeout(timer);
              unsub();
              resolve({ called: true, from, to });
            });
            const timer = setTimeout(() => {
              unsub();
              resolve({ called: false, from: -1, to: -1 });
            }, 500);
            session.append("!");
          });
          return verdict(
            listenerResult.called &&
              listenerResult.from >= 0 &&
              listenerResult.to > listenerResult.from,
            undefined,
            `called=${listenerResult.called} from=${listenerResult.from} to=${listenerResult.to}`,
          );
        });

        await check("session.clear", () => {
          session.clear();
          return verdict(session.getAllText() === "");
        });
      } finally {
        session.dispose();
      }
    } catch (e) {
      fail("MarkdownSession", String(e));
    }
  }

  spacer();

  header("SOURCE AST");

  await check("sourceAst structure valid", () => {
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
    return verdict(
      preBuilt.type === "document" && preBuilt.children?.[0]?.type === "heading",
      undefined,
      "unexpected structure",
    );
  });

  spacer();

  const passed = countLogs(logs, "pass");
  const failed = countLogs(logs, "fail");
  const skipped = countLogs(logs, "skip");
  const total = passed + failed;

  header("SUMMARY");
  logs.push({
    text: `${passed}/${total} passed${failed > 0 ? ` (${failed} failed)` : ""}${
      skipped > 0 ? `, ${skipped} unsupported` : ""
    }`,
    type: "summary",
    failed: failed > 0,
  });

  return logs;
}

export default function BenchmarkScreen() {
  const [smokeLogs, setSmokeLogs] = useState<LogEntry[]>([]);
  const [pipelineSmokeRunId, setPipelineSmokeRunId] = useState(0);
  const [benchmarkResults, setBenchmarkResults] =
    useState<BenchmarkResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"idle" | "smoke" | "bench">("idle");
  const [isBenchmarkRunning, setIsBenchmarkRunning] = useState(false);
  const tabHeight = useBottomTabHeight();
  const latexTimer = useLayoutTimer<LatexBenchmarkRenderer>();
  const renderTimer = useLayoutTimer<RenderBenchmarkKind>();

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

  const measureRenderMedian = async (
    kind: RenderBenchmarkKind,
  ): Promise<number | null> => {
    const samples: number[] = [];
    for (let index = 0; index < RENDER_SAMPLE_COUNT; index++) {
      const result = await renderTimer.measure(kind);
      if (result !== null) samples.push(result);
      await wait(80);
    }
    if (samples.length === 0) return null;
    samples.sort((a, b) => a - b);
    return samples[Math.floor(samples.length / 2)] ?? null;
  };

  const runSmoke = async () => {
    setMode("smoke");
    setPipelineSmokeRunId((runId) => runId + 1);
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

  const { autorun } = useLocalSearchParams<{ autorun?: string }>();
  const autorunStarted = useRef(false);
  useEffect(() => {
    // Replay flows start the smoke run by deep link: iOS reports the tab
    // screen's buttons as covered, so agent-device cannot press them.
    if (autorun !== "smoke" || autorunStarted.current) return;
    autorunStarted.current = true;
    void runSmoke();
  });

  const runBenchmark = async () => {
    setMode("bench");
    setSmokeLogs([]);
    setBenchmarkResults(null);
    setError(null);
    setIsBenchmarkRunning(true);

    const stepErrors: string[] = [];
    const isolate = async <T,>(
      step: string,
      run: () => T | Promise<T>,
    ): Promise<T | null> => {
      try {
        return await run();
      } catch (e) {
        stepErrors.push(`${step}: ${e instanceof Error ? e.message : String(e)}`);
        return null;
      } finally {
        await wait(60);
      }
    };

    await wait(60);

    const nitro = await isolate("Nitro parse", () => runNitroBenchmark(true));
    const nitroNoOffsets = await isolate("Nitro parse (no offsets)", () =>
      runNitroBenchmark(false),
    );

    const mathjaxTime = await isolate("Legacy MathJax render", () =>
      latexTimer.measure("legacy-mathjax"),
    );
    const ratexTime = await isolate("RaTeX render", () =>
      latexTimer.measure("ratex"),
    );
    const nitroRenderTime = await isolate("Nitro mount to layout", () =>
      measureRenderMedian("nitro"),
    );
    const nitroFirstScreenTime = await isolate("Nitro first screen", () =>
      measureRenderMedian("nitro-long"),
    );

    setBenchmarkResults({
      nitro,
      nitroNoOffsets,
      stepErrors,
      mathjaxTime,
      ratexTime,
      nitroRenderTime,
      nitroFirstScreenTime,
    });
    setIsBenchmarkRunning(false);
  };

  const parseMaxMs = Math.max(
    benchmarkResults?.nitro?.average ?? 0,
    benchmarkResults?.nitroNoOffsets?.average ?? 0,
  );

  const smokeProbeLabel = error
    ? "smoke:error;"
    : mode === "smoke" && smokeLogs.length > 0
      ? `smoke:pass=${countLogs(smokeLogs, "pass")}:fail=${countLogs(smokeLogs, "fail")}:skip=${countLogs(smokeLogs, "skip")};`
      : "smoke:idle;";

  return (
    <ExampleScreen paddingBottom={0} style={styles.screenContent}>
      <View
        testID="smoke-probe"
        accessible
        accessibilityLabel={smokeProbeLabel}
        style={styles.resultsProbe}
      />
      <View style={styles.buttonRow}>
        <ExampleActionButton
          testID="run-smoke-tests"
          active={mode === "smoke"}
          style={styles.benchmarkButton}
          onPress={runSmoke}
        >
          Run Smoke Tests
        </ExampleActionButton>
        <ExampleActionButton
          testID="run-benchmark"
          active={mode === "bench"}
          style={styles.benchmarkButton}
          onPress={runBenchmark}
        >
          Run Benchmark
        </ExampleActionButton>
      </View>
      <E2eGate />

      <ScrollView
        style={styles.resultsScroll}
        contentContainerStyle={{ paddingBottom: tabHeight + 20 }}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
      >
        {mode === "smoke" && pipelineSmokeRunId > 0 ? (
          <MarkdownPipelineSmoke key={pipelineSmokeRunId} />
        ) : null}
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
                  testID={
                    i === smokeLogs.length - 1 ? "smoke-summary" : undefined
                  }
                  style={[
                    styles.resultText,
                    log.type === "header" && styles.logHeader,
                    log.type === "pass" && styles.logPass,
                    log.type === "fail" && styles.logFail,
                    log.type === "info" && styles.logInfo,
                    log.type === "skip" && styles.logSkip,
                    log.type === "summary" &&
                      (log.failed ? styles.logFail : styles.logPass),
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
              {benchmarkResults.nitro ? (
                <BenchBar
                  label="Nitro C++"
                  ms={benchmarkResults.nitro.average}
                  maxMs={parseMaxMs}
                  highlight
                />
              ) : null}
              {benchmarkResults.nitroNoOffsets ? (
                <BenchBar
                  label="Nitro C++ · no offsets"
                  ms={benchmarkResults.nitroNoOffsets.average}
                  maxMs={parseMaxMs}
                  ratio={
                    benchmarkResults.nitro
                      ? formatRatio(
                          benchmarkResults.nitro.average,
                          benchmarkResults.nitroNoOffsets.average,
                        )
                      : undefined
                  }
                />
              ) : null}
              {benchmarkResults.nitro ? (
                <Text style={styles.metricNote}>
                  Nitro p50 / p95 over {benchmarkResults.nitro.iterations} runs:{" "}
                  {benchmarkResults.nitro.p50.toFixed(1)} /{" "}
                  {benchmarkResults.nitro.p95.toFixed(1)}ms.
                </Text>
              ) : null}
              {benchmarkResults.nitroNoOffsets ? (
                <Text style={styles.metricNote}>
                  No-offset p50 / p95: {benchmarkResults.nitroNoOffsets.p50.toFixed(1)} /{" "}
                  {benchmarkResults.nitroNoOffsets.p95.toFixed(1)}ms. This is the renderer fast path; public parse defaults retain offsets.
                </Text>
              ) : null}
            </View>

            {benchmarkResults.stepErrors.length > 0 ? (
              <ExamplePanel style={styles.errorBox}>
                <Text style={styles.errorTitle}>Failed steps</Text>
                {benchmarkResults.stepErrors.map((message) => (
                  <Text key={message} style={styles.errorMessage}>
                    {message}
                  </Text>
                ))}
              </ExamplePanel>
            ) : null}

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

      {latexTimer.target ? (
        <View
          key={`${latexTimer.target.payload}-${latexTimer.target.token}`}
          pointerEvents="none"
          style={styles.latexBenchmarkHost}
          onLayout={latexTimer.onLayout}
        >
          <Markdown
            options={{ gfm: true, math: true }}
            renderers={
              latexTimer.target.payload === "legacy-mathjax"
                ? legacyMathRenderers
                : mathRenderers
            }
          >
            {LATEX_BENCH_MARKDOWN}
          </Markdown>
        </View>
      ) : null}

      {renderTimer.target ? (
        <View
          key={`${renderTimer.target.payload}-${renderTimer.target.token}`}
          pointerEvents="none"
          style={styles.latexBenchmarkHost}
          onLayout={renderTimer.onLayout}
        >
          {renderTimer.target.payload === "nitro" ? (
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
  resultsProbe: {
    height: 1,
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
