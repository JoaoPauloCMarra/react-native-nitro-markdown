import {
  memo,
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  type ComponentRef,
} from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  useMarkdownSession,
  Markdown,
  MarkdownStream,
  useMarkdownStreamState,
  type MarkdownNode,
  type MarkdownStreamRenderProps,
} from "react-native-nitro-markdown";
import { mathRenderers } from "react-native-nitro-markdown/math";
import {
  ExampleActionButton,
  ExampleHeader,
  ExamplePanel,
  ExampleScreen,
  ExampleSectionLabel,
} from "../../components/example-ui";
import { useBottomTabHeight } from "../../hooks/use-bottom-tab-height";
import { EXAMPLE_COLORS } from "../../theme";
import { ISSUE_74_STANDALONE_EQUALS_DISPLAY_MATH_MARKDOWN } from "../../markdown-test-data";

const TOKEN_DELAY_MS = 150;
const RAW_PREVIEW_SYNC_INTERVAL_MS = 60;
const RAW_PREVIEW_MAX_CHARS = 3000;
const CHARS_PER_TICK = 12;
const STREAM_PARSER_OPTIONS = {
  gfm: true,
  math: true,
  maxInputLength: 1_000_000,
} as const;
const DEMO_TEXT = `
### 🚀 Streaming Markdown

This demo streams text into a native session and renders it as it arrives.
Chunks are batched before each render.

## Features
- Native session buffer
- **JSI** bindings
- Native C++ parser (md4c)

### Code Example
\`\`\`typescript
const session = createMarkdownSession();
session.append("Hello **Nitro**!");
\`\`\`

> "Speed is a feature."
> — The Nitro Team

You can even use **lists** or *italics* while streaming tokens in real-time.
- Item 1
- Item 2
  - Nested Item
  
And it handles paragraphs seamlessly.

## Math While Streaming

Inline math should settle into the text flow as tokens arrive: $E = mc^2$ and $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$.

Block math should render as a readable equation once the closing delimiters arrive:

$$\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}$$

Larger expressions should stay legible:

$$\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}$$

## More Content for Testing

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

### How Streaming Works

LLM responses arrive token by token. Re-rendering the whole document for every token wastes work, so the stream batches updates.

Nitro Markdown streams by:
1. Keeping the text buffer in a native session
2. Reading only the changed range after each batch
3. Appending plain text to the previous AST when that is safe, and re-parsing otherwise

## Deep Dive

Let's look at some *more complex* structures.

| Step | Where it runs | Notes |
| :--- | :--- | :--- |
| Buffer | Native session | Append, replace, reset |
| Parse | C++ (md4c) | Synchronous JSI call |
| Render | React Native | Batched by \`updateIntervalMs\` or \`raf\` |

Use the Bench tab to measure parse and render time on your device.

### Final Thoughts

We hope you enjoy using **Nitro Markdown**. It is designed to be the *definitive* way to render Markdown in React Native apps, especially those driven by AI.

Happy Coding! 

## Issue #74 Streaming Display Math

${ISSUE_74_STANDALONE_EQUALS_DISPLAY_MATH_MARKDOWN}
`;

const DEMO_ATOMIC_LINE_RANGES: readonly (readonly [number, number])[] = (() => {
  const ranges: [number, number][] = [];
  let lineStart = 0;
  let insideFence = false;
  while (lineStart < DEMO_TEXT.length) {
    const newline = DEMO_TEXT.indexOf("\n", lineStart);
    const lineEnd = newline === -1 ? DEMO_TEXT.length : newline + 1;
    const line = DEMO_TEXT.slice(lineStart, lineEnd).trim();
    const isFenceLine = line.startsWith("```");
    if (isFenceLine || insideFence || line.startsWith("|")) {
      ranges.push([lineStart, lineEnd]);
    }
    if (isFenceLine) insideFence = !insideFence;
    lineStart = lineEnd;
  }
  return ranges;
})();

function getDemoChunkEnd(offset: number): number {
  const target = Math.min(offset + CHARS_PER_TICK, DEMO_TEXT.length);
  for (const [start, end] of DEMO_ATOMIC_LINE_RANGES) {
    if (offset >= start && offset < end) return end;
    if (start > offset && start < target) return start;
  }
  return target;
}

type MarkdownRendererPanelProps = {
  session: ReturnType<typeof useMarkdownSession>;
  hasContent: boolean;
  mode: StreamRenderMode;
};

type RawPreviewPanelProps = {
  session: ReturnType<typeof useMarkdownSession>;
};

type StreamRenderMode = "builtIn" | "custom" | "headless";

type ModeOption = {
  key: StreamRenderMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

type ExternalPreviewProps = {
  text: string;
  sourceAst?: MarkdownNode;
  sourceAstStatus: string;
};

const MODE_OPTIONS: ModeOption[] = [
  { key: "builtIn", label: "Built-in", icon: "document-text-outline" },
  { key: "custom", label: "Custom", icon: "swap-horizontal-outline" },
  { key: "headless", label: "Hook", icon: "git-branch-outline" },
];

function getRawPreviewText(text: string): string {
  if (text.length <= RAW_PREVIEW_MAX_CHARS) return text;
  return text.slice(text.length - RAW_PREVIEW_MAX_CHARS);
}

function countNodes(node: MarkdownNode | undefined): number {
  if (!node) return 0;
  return 1 + (node.children?.reduce((total, child) => total + countNodes(child), 0) ?? 0);
}

function getPreviewLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-8);
}

function getLineStyle(line: string) {
  if (line.startsWith("#")) return styles.externalHeading;
  if (line.startsWith("-") || /^\d+\./.test(line)) return styles.externalListItem;
  if (line.startsWith(">")) return styles.externalQuote;
  return styles.externalParagraph;
}

function readSessionText(
  session: ReturnType<typeof useMarkdownSession>,
  fallback = "",
): string {
  try {
    return session.getSession().getAllText();
  } catch {
    return fallback;
  }
}

const RawPreviewPanel = memo(function RawPreviewPanel({
  session,
}: RawPreviewPanelProps) {
  const rawScrollViewRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [rawText, setRawText] = useState(() =>
    getRawPreviewText(readSessionText(session)),
  );
  const rawTextRef = useRef(rawText);

  const getSessionText = useCallback(
    (fallback: string) => {
      return readSessionText(session, fallback);
    },
    [session],
  );

  const handleRawContentSizeChange = useCallback(() => {
    rawScrollViewRef.current?.scrollToEnd({ animated: false });
  }, []);

  useEffect(() => {
    rawTextRef.current = rawText;
  }, [rawText]);

  useEffect(() => {
    const pendingRef = { current: false };
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      if (!pendingRef.current) return;
      pendingRef.current = false;

      const nextText = getRawPreviewText(getSessionText(rawTextRef.current));
      if (nextText !== rawTextRef.current) {
        rawTextRef.current = nextText;
        setRawText(nextText);
      }
    };

    let unsubscribe: (() => void) | null = null;

    try {
      unsubscribe = session.getSession().addListener(() => {
        pendingRef.current = true;
        if (!timer) {
          timer = setTimeout(flush, RAW_PREVIEW_SYNC_INTERVAL_MS);
        }
      });
    } catch {
      return () => {
        if (timer) clearTimeout(timer);
      };
    }

    return () => {
      pendingRef.current = false;
      unsubscribe?.();
      if (timer) clearTimeout(timer);
    };
  }, [session, getSessionText]);

  return (
    <ExamplePanel style={styles.card}>
      <ScrollView
        ref={rawScrollViewRef}
        style={styles.cardScroll}
        nestedScrollEnabled
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={handleRawContentSizeChange}
      >
        {rawText.length === 0 ? (
          <Text style={styles.placeholderText}>Waiting for input...</Text>
        ) : (
          <Text style={styles.rawText}>{rawText}</Text>
        )}
      </ScrollView>
    </ExamplePanel>
  );
});

const MarkdownRendererPanel = memo(function MarkdownRendererPanel({
  session,
  hasContent,
  mode,
}: MarkdownRendererPanelProps) {
  const markdownScrollViewRef = useRef<ComponentRef<typeof ScrollView>>(null);

  const handleContentSizeChange = useCallback(() => {
    markdownScrollViewRef.current?.scrollToEnd({ animated: false });
  }, []);

  const renderCustomMarkdown = useCallback(
    ({ text, sourceAst, sourceAstStatus }: MarkdownStreamRenderProps) => (
      <ExternalPreview
        text={text}
        sourceAst={sourceAst}
        sourceAstStatus={sourceAstStatus}
      />
    ),
    [],
  );

  return (
    <ExamplePanel style={[styles.card, styles.markdownCard]}>
      <ScrollView
        ref={markdownScrollViewRef}
        style={styles.cardScroll}
        nestedScrollEnabled
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        contentContainerStyle={styles.scrollContent}
        onContentSizeChange={handleContentSizeChange}
      >
        {!hasContent ? (
          <View style={styles.placeholder}>
            <Ionicons
              name="code-slash-outline"
              size={32}
              color={EXAMPLE_COLORS.textMuted}
            />
            <Text style={styles.placeholderText}>Waiting for tokens...</Text>
          </View>
        ) : mode === "builtIn" ? (
          <MarkdownStream
            session={session}
            options={STREAM_PARSER_OPTIONS}
            renderers={mathRenderers}
            updateStrategy="raf"
            useTransitionUpdates
          />
        ) : mode === "custom" ? (
          <MarkdownStream
            session={session}
            options={STREAM_PARSER_OPTIONS}
            updateStrategy="raf"
            useTransitionUpdates
            renderMarkdown={renderCustomMarkdown}
          />
        ) : (
          <HeadlessStreamPreview session={session} />
        )}
      </ScrollView>
    </ExamplePanel>
  );
});

const Issue74StaticFixture = memo(function Issue74StaticFixture() {
  return (
    <ExamplePanel style={[styles.card, styles.issueFixtureCard]}>
      <Text style={styles.panelTitle}>Issue #74 Static Display Math</Text>
      <ScrollView
        style={styles.cardScroll}
        nestedScrollEnabled
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        contentContainerStyle={styles.scrollContent}
      >
        <Markdown options={STREAM_PARSER_OPTIONS} renderers={mathRenderers}>
          {ISSUE_74_STANDALONE_EQUALS_DISPLAY_MATH_MARKDOWN}
        </Markdown>
      </ScrollView>
    </ExamplePanel>
  );
});

const ExternalPreview = memo(function ExternalPreview({
  text,
  sourceAst,
  sourceAstStatus,
}: ExternalPreviewProps) {
  const lines = useMemo(() => getPreviewLines(text), [text]);
  const nodeCount = useMemo(() => countNodes(sourceAst), [sourceAst]);

  return (
    <View style={styles.externalPreview}>
      <View style={styles.externalHeader}>
        <View style={styles.externalHeaderIcon}>
          <Ionicons name="swap-horizontal" size={16} color={EXAMPLE_COLORS.accentDeep} />
        </View>
        <View style={styles.externalHeaderText}>
          <Text style={styles.externalTitle}>External Renderer Adapter</Text>
          <Text style={styles.externalSubtitle}>
            {sourceAstStatus === "available"
              ? `${nodeCount} AST nodes available`
              : "Text-only stream state"}
          </Text>
        </View>
      </View>
      <View style={styles.externalBody}>
        {lines.map((line, index) => (
          <Text key={`${index}-${line}`} style={getLineStyle(line)} numberOfLines={2}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
});

const HeadlessStreamPreview = memo(function HeadlessStreamPreview({
  session,
}: {
  session: ReturnType<typeof useMarkdownSession>;
}) {
  const streamState = useMarkdownStreamState({
    session,
    options: STREAM_PARSER_OPTIONS,
    updateStrategy: "raf",
    useTransitionUpdates: true,
  });
  const lines = useMemo(() => getPreviewLines(streamState.text), [streamState.text]);
  const nodeCount = useMemo(() => countNodes(streamState.sourceAst), [streamState.sourceAst]);

  return (
    <View style={styles.externalPreview}>
      <View style={styles.externalHeader}>
        <View style={[styles.externalHeaderIcon, styles.hookHeaderIcon]}>
          <Ionicons name="git-branch" size={16} color={EXAMPLE_COLORS.info} />
        </View>
        <View style={styles.externalHeaderText}>
          <Text style={styles.externalTitle}>Headless Hook Consumer</Text>
          <Text style={styles.externalSubtitle}>
            {streamState.text.length} chars, {nodeCount} AST nodes
          </Text>
        </View>
      </View>
      <View style={styles.headlessGrid}>
        <View style={styles.metricCell}>
          <Text style={styles.metricValue}>{streamState.text.length}</Text>
          <Text style={styles.metricLabel}>chars</Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={styles.metricValue}>{nodeCount}</Text>
          <Text style={styles.metricLabel}>nodes</Text>
        </View>
        <View style={styles.metricCell}>
          <Text style={styles.metricValue}>
            {streamState.sourceAstStatus === "available" ? "AST" : "Text"}
          </Text>
          <Text style={styles.metricLabel}>mode</Text>
        </View>
      </View>
      <View style={styles.externalBody}>
        {lines.slice(-4).map((line, index) => (
          <Text key={`${index}-${line}`} style={styles.externalParagraph} numberOfLines={2}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
});

export default function TokenStreamScreen() {
  const tabHeight = useBottomTabHeight();

  const [isStreamMode, setIsStreamMode] = useState(false);
  const [streamOffset, setStreamOffset] = useState(0);
  const [hasStreamContent, setHasStreamContent] = useState(false);
  const [isUiActive, setIsUiActive] = useState(true);
  const [rawPreviewResetKey, setRawPreviewResetKey] = useState(0);
  const [renderMode, setRenderMode] = useState<StreamRenderMode>("builtIn");

  const session = useMarkdownSession();
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamOffsetRef = useRef(0);
  const hasStreamContentRef = useRef(false);

  const appendToSession = useCallback(
    (chunk: string) => {
      try {
        session.getSession().append(chunk);
        return true;
      } catch {
        return false;
      }
    },
    [session],
  );

  const stopStream = useCallback(() => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    setIsStreamMode(false);
    setStreamOffset(streamOffsetRef.current);
  }, []);

  const startStream = useCallback(() => {
    if (!isStreamMode && streamOffsetRef.current === 0) {
      session.clear();
      hasStreamContentRef.current = false;
      setHasStreamContent(false);
    }

    setIsStreamMode(true);

    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
    }

    streamIntervalRef.current = setInterval(() => {
      const chunk = DEMO_TEXT.slice(
        streamOffsetRef.current,
        getDemoChunkEnd(streamOffsetRef.current),
      );
      if (chunk.length === 0) {
        stopStream();
        return;
      }

      if (!appendToSession(chunk)) {
        stopStream();
        return;
      }
      if (!hasStreamContentRef.current) {
        hasStreamContentRef.current = true;
        setHasStreamContent(true);
      }
      streamOffsetRef.current += chunk.length;
    }, TOKEN_DELAY_MS);
  }, [session, stopStream, isStreamMode, appendToSession]);

  const clearStream = useCallback(() => {
    stopStream();
    streamOffsetRef.current = 0;
    hasStreamContentRef.current = false;
    setStreamOffset(0);
    setHasStreamContent(false);
    setRawPreviewResetKey((key) => key + 1);
    session.clear();
  }, [stopStream, session]);

  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      const timer = setTimeout(() => setIsUiActive(true), 0);
      return () => {
        clearTimeout(timer);
        setIsUiActive(false);
      };
    }, []),
  );

  return (
    <ExampleScreen paddingBottom={0} style={styles.screenContent}>
      <View style={styles.header}>
        <ExampleHeader
          title="Token Stream"
          subtitle={`Direct raw vs markdown render (${TOKEN_DELAY_MS}ms delay).`}
        />
        <View style={styles.controlsRow}>
          <ExampleActionButton
            testID="stream-toggle"
            active={isStreamMode}
            tone="neutral"
            style={styles.btn}
            onPress={isStreamMode ? stopStream : startStream}
            icon={
              <Ionicons
                name={isStreamMode ? "pause" : "flash"}
                size={16}
                color={
                  isStreamMode ? EXAMPLE_COLORS.accent : EXAMPLE_COLORS.text
                }
              />
            }
          >
            {isStreamMode ? "Pause" : streamOffset > 0 ? "Resume" : "Start"}
          </ExampleActionButton>
          <ExampleActionButton
            testID="stream-clear"
            tone="danger"
            style={styles.clearButton}
            onPress={clearStream}
            icon={
              <Ionicons name="trash" size={16} color={EXAMPLE_COLORS.danger} />
            }
          >
            Clear
          </ExampleActionButton>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContainer,
          { paddingBottom: tabHeight + 20 },
        ]}
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
      >
        <ExamplePanel>
          <Text style={styles.panelTitle}>Streaming Performance Lab</Text>
          <Text style={styles.panelSubtitle}>
            Compare raw token input with rendered markdown in real time.
          </Text>
        </ExamplePanel>
        <View style={styles.modeTabs}>
          {MODE_OPTIONS.map((option) => {
            const active = renderMode === option.key;
            return (
              <ExampleActionButton
                key={option.key}
                testID={`stream-mode-${option.key}`}
                active={active}
                tone="neutral"
                style={styles.modeButton}
                onPress={() => setRenderMode(option.key)}
                icon={
                  <Ionicons
                    name={option.icon}
                    size={15}
                    color={active ? EXAMPLE_COLORS.accent : EXAMPLE_COLORS.textMuted}
                  />
                }
              >
                {option.label}
              </ExampleActionButton>
            );
          })}
        </View>
        <ExampleSectionLabel>Issue #74 Regression Fixture</ExampleSectionLabel>
        <Issue74StaticFixture />
        <ExampleSectionLabel>Raw Token Data</ExampleSectionLabel>
        {isUiActive ? (
          <RawPreviewPanel key={rawPreviewResetKey} session={session} />
        ) : null}

        <ExampleSectionLabel>Markdown Renderer</ExampleSectionLabel>
        {isUiActive ? (
          <MarkdownRendererPanel
            session={session}
            hasContent={hasStreamContent}
            mode={renderMode}
          />
        ) : null}
      </ScrollView>
    </ExampleScreen>
  );
}

const styles = StyleSheet.create({
  screenContent: {
    padding: 0,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  panelTitle: {
    color: EXAMPLE_COLORS.text,
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  panelSubtitle: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },

  controlsRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginTop: 8,
  },
  btn: {
    flex: 1,
  },
  clearButton: {
    minWidth: 86,
  },

  scrollContainer: { paddingHorizontal: 16, paddingTop: 10, gap: 10 },

  modeTabs: {
    flexDirection: "row",
    gap: 8,
  },
  modeButton: {
    flex: 1,
    minHeight: 36,
    paddingHorizontal: 8,
  },

  card: {
    height: 200,
    overflow: "hidden",
  },
  issueFixtureCard: {
    height: 240,
  },
  markdownCard: {
    backgroundColor: EXAMPLE_COLORS.surface,
    height: 400,
  },
  cardScroll: { flex: 1 },
  scrollContent: { padding: 10 },

  rawText: {
    color: EXAMPLE_COLORS.textMuted,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    fontSize: 12,
    lineHeight: 18,
  },

  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 200,
    gap: 12,
  },
  placeholderText: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 13,
    fontWeight: "500",
  },
  externalPreview: {
    gap: 12,
  },
  externalHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    backgroundColor: EXAMPLE_COLORS.surfaceMuted,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
  },
  externalHeaderIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: EXAMPLE_COLORS.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  hookHeaderIcon: {
    backgroundColor: EXAMPLE_COLORS.infoSoft,
  },
  externalHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  externalTitle: {
    color: EXAMPLE_COLORS.text,
    fontSize: 14,
    fontWeight: "800",
  },
  externalSubtitle: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  externalBody: {
    gap: 8,
  },
  externalHeading: {
    color: EXAMPLE_COLORS.accentDeep,
    fontSize: 16,
    fontWeight: "800",
    lineHeight: 22,
  },
  externalListItem: {
    color: EXAMPLE_COLORS.text,
    fontSize: 13,
    lineHeight: 19,
    paddingLeft: 8,
  },
  externalQuote: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: EXAMPLE_COLORS.accent,
  },
  externalParagraph: {
    color: EXAMPLE_COLORS.text,
    fontSize: 13,
    lineHeight: 19,
  },
  headlessGrid: {
    flexDirection: "row",
    gap: 8,
  },
  metricCell: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    backgroundColor: EXAMPLE_COLORS.surfaceMuted,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
  },
  metricValue: {
    color: EXAMPLE_COLORS.text,
    fontSize: 16,
    fontWeight: "800",
  },
  metricLabel: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
    textTransform: "uppercase",
  },
});
