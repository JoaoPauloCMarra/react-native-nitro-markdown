import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Markdown,
  TableRenderer,
  createMarkdownSession,
  useMarkdownStreamState,
  type CodeHighlighter,
  type CustomRenderers,
  type MarkdownErrorPhase,
  type MarkdownNode,
  type MarkdownParseCompleteResult,
  type MarkdownPlugin,
} from "react-native-nitro-markdown";
import { mathRenderers } from "react-native-nitro-markdown/math";
import { EXAMPLE_COLORS } from "../theme";

type Report = (key: string, token: string) => void;

const ERROR_OPTIONS = { maxInputLength: 4 } as const;
const HTML_OPTIONS = { html: true } as const;
const MATH_OPTIONS = { math: true } as const;
const CODE_LANGUAGE_THEME = { showCodeLanguage: true } as const;
const WIDE_TABLE_OPTIONS = { minColumnWidth: 120 } as const;
const TABLE_MARKDOWN = "| Alpha | Beta |\n|---|---|\n| a | b |";
const BEFORE_PARSE_PLUGINS: MarkdownPlugin[] = [{ name: "e2e-before-parse", beforeParse: (markdown) => markdown }];
const PARSE_ERROR_OPTIONS = { maxInputLength: 4 } as const;

const collectTypes = (node: MarkdownNode, types: Set<string> = new Set()): Set<string> => {
  types.add(node.type);
  node.children?.forEach((child) => collectTypes(child, types));
  return types;
};

function MeasuredTable({ node, Renderer, onWidth }: Parameters<NonNullable<CustomRenderers["table"]>>[0] & { onWidth: (width: number) => void }) {
  return (
    <View style={styles.shrink} onLayout={(event: LayoutChangeEvent) => onWidth(event.nativeEvent.layout.width)}>
      <TableRenderer node={node} Renderer={Renderer} />
    </View>
  );
}

function StreamAsyncProbe({ report }: { report: Report }) {
  const [session] = useState(() => createMarkdownSession("# Async initial"));
  const state = useMarkdownStreamState({ session, initialParseMode: "async" });
  const [first] = useState(state.sourceAstStatus === "available" ? "available" : (state.sourceAstDisabledReason ?? "disabled"));
  const token = state.sourceAstStatus === "available" ? `async=${first}>available` : `async=${first}`;
  useEffect(() => report("async", token), [report, token]);
  useEffect(() => () => session.dispose(), [session]);
  return null;
}

function StreamBeforeParseProbe({ report }: { report: Report }) {
  const [session] = useState(() => createMarkdownSession("# Before parse"));
  const state = useMarkdownStreamState({ session, plugins: BEFORE_PARSE_PLUGINS });
  const token = `reason=${state.sourceAstStatus === "available" ? "available" : (state.sourceAstDisabledReason ?? "none")}`;
  useEffect(() => report("reason", token), [report, token]);
  useEffect(() => () => session.dispose(), [session]);
  return null;
}

function StreamParseErrorProbe({ report }: { report: Report }) {
  const [session] = useState(() => createMarkdownSession("# Longer than four bytes"));
  const onError = useCallback((_error: Error, phase: MarkdownErrorPhase) => report("streamerr", `streamerr=${phase}`), [report]);
  useMarkdownStreamState({ session, options: PARSE_ERROR_OPTIONS, onError });
  useEffect(() => () => session.dispose(), [session]);
  return null;
}

export default function MarkdownRenderContractsScreen() {
  const insets = useSafeAreaInsets();
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [tableWidths, setTableWidths] = useState<{ wide?: number; control?: number }>({});
  const report = useCallback<Report>((key, token) => {
    void Promise.resolve().then(() =>
      setTokens((current) => (current[key] === token ? current : { ...current, [key]: token })),
    );
  }, []);

  const onRenderError = useCallback(
    (_error: Error, phase: MarkdownErrorPhase) => report("errortext", `errortext=${phase}`),
    [report],
  );
  const onHtmlParsed = useCallback(
    ({ ast }: MarkdownParseCompleteResult) => {
      const types = collectTypes(ast);
      report("html", `html=${types.has("html_inline") ? "inline" : "none"}+${types.has("html_block") ? "block" : "none"}`);
    },
    [report],
  );
  const highlightCalls = useRef<string[]>([]);
  const highlightCode = useCallback<CodeHighlighter>(
    (language, code) => {
      const calls = highlightCalls.current;
      calls.push(language);
      report("hl", `hl=${[...new Set(calls)].join(",")}:${calls.length}`);
      return [{ text: code, type: "keyword" }];
    },
    [report],
  );
  const headingRenderers = useMemo<CustomRenderers>(() => ({
    heading: ({ level, children }) => {
      report("custom", `custom=heading-${level}`);
      return (
        <View testID="custom-heading-marker" style={styles.customHeading}>
          <Text style={styles.customHeadingText}>{children}</Text>
        </View>
      );
    },
  }), [report]);
  const wideTableRenderers = useMemo<CustomRenderers>(() => ({
    table: (props) => <MeasuredTable {...props} onWidth={(width) => setTableWidths((current) => ({ ...current, wide: width }))} />,
  }), []);
  const controlTableRenderers = useMemo<CustomRenderers>(() => ({
    table: (props) => <MeasuredTable {...props} onWidth={(width) => setTableWidths((current) => ({ ...current, control: width }))} />,
  }), []);
  const linkRenderers = useMemo<CustomRenderers>(() => ({
    paragraph: ({ children }) => (
      <View testID="link-press-target" style={styles.shrink}>
        <Text style={styles.linkText}>{children}</Text>
      </View>
    ),
  }), []);
  const onLinkPress = useCallback(
    (href: string) => {
      report("link", `link=${href}:blocked`);
      return false;
    },
    [report],
  );

  const tableToken =
    tableWidths.wide === undefined || tableWidths.control === undefined
      ? undefined
      : `tablew${tableWidths.wide >= 240 ? ">=" : "<"}240:ctl${tableWidths.control < 240 ? "<" : ">="}240`;
  const allTokens = tableToken ? { ...tokens, tablew: tableToken } : tokens;
  const values = Object.values(allTokens);
  const label = values.length === 0 ? "render:pending;" : `render:${values.map((token) => `${token};`).join("")}`;

  return (
    <View testID="e2e-render-contracts-screen" style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View testID="render-contracts-probe" accessible accessibilityLabel={label} style={styles.resultsProbe} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <View testID="error-text-surface">
          <Markdown options={ERROR_OPTIONS} errorText="ERR_TEXT_OK" onError={onRenderError}>{"# longer than four bytes"}</Markdown>
        </View>
        <Markdown renderers={headingRenderers}>{"## Custom heading renderer"}</Markdown>
        <View testID="html-surface">
          <Markdown options={HTML_OPTIONS} onParseComplete={onHtmlParsed}>{"Inline <span>HTML_INLINE</span> text\n\n<div>HTML_BLOCK</div>\n"}</Markdown>
        </View>
        <View testID="code-language-surface">
          <Markdown theme={CODE_LANGUAGE_THEME}>{"```e2elang\nconst shown = true;\n```"}</Markdown>
        </View>
        <View testID="table-surface">
          <Markdown renderers={wideTableRenderers} tableOptions={WIDE_TABLE_OPTIONS}>{TABLE_MARKDOWN}</Markdown>
        </View>
        <Markdown renderers={controlTableRenderers}>{TABLE_MARKDOWN}</Markdown>
        <View testID="math-surface">
          <Markdown options={MATH_OPTIONS} renderers={mathRenderers}>{"$$E2Emath^{2}$$"}</Markdown>
        </View>
        <Markdown highlightCode={highlightCode}>{"```ts\nconst highlighted = 1;\n```"}</Markdown>
        <StreamAsyncProbe report={report} />
        <StreamBeforeParseProbe report={report} />
        <StreamParseErrorProbe report={report} />
        <Markdown renderers={linkRenderers} onLinkPress={onLinkPress}>{"[Press the E2E link target](https://example.test)"}</Markdown>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: EXAMPLE_COLORS.background },
  resultsProbe: { height: 1 },
  content: { paddingHorizontal: 16, gap: 4 },
  shrink: { alignSelf: "flex-start" },
  customHeading: { borderLeftWidth: 3, borderLeftColor: EXAMPLE_COLORS.border, paddingLeft: 8 },
  customHeadingText: { color: EXAMPLE_COLORS.text, fontSize: 16, fontWeight: "700" },
  linkText: { color: EXAMPLE_COLORS.text, fontSize: 16, paddingVertical: 8 },
});
