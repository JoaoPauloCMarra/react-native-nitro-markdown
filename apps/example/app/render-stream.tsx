import { memo, useState, useEffect, useRef, useCallback, useMemo } from "react";
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
  MarkdownStream,
  useMarkdownStreamState,
  type MarkdownNode,
  type MarkdownStreamRenderProps,
} from "react-native-nitro-markdown";
import {
  ExampleActionButton,
  ExampleHeader,
  ExamplePanel,
  ExampleScreen,
  ExampleSectionLabel,
} from "../components/example-ui";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";
import { EXAMPLE_COLORS } from "../theme";

const TOKEN_DELAY_MS = 150;
const RAW_PREVIEW_SYNC_INTERVAL_MS = 60;
const RAW_PREVIEW_MAX_CHARS = 3000;
const CHARS_PER_TICK = 12;
const DEMO_TEXT = `
### 🚀 High-Performance Markdown

Nitro Markdown isn't just fast; it's **blazingly fast**. 
It handles large streams of text *without* dropping frames.

## Features
- **Zero-Copy** Buffering
- **JSI** Powered
- Native C++ Core

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

### Why Performance Matters

When building LLM-powered applications, **latency** and **responsiveness** are key. Users expect the text to appear as if it's being typed by a human, but much faster. Creating a new string constant for every token and re-parsing the entire document in JavaScript is simply too slow for long documents.

Nitro Markdown solves this by:
1. Keeping the text buffer in C++ memory
2. Only bridging the necessary render commands
3. Using JSI for synchronous, high-speed communication

## Deep Dive

Let's look at some *more complex* structures.

| Feature | JS Implementation | Nitro Implementation |
| :--- | :--- | :--- |
| Parsing | ~50ms | ~2ms |
| Memory | High GC Overhead | Stable Heap |
| FPS | Janky during stream | **60/120 FPS** |

The difference becomes night and day when you have documents spanning thousands of words.

### Final Thoughts

We hope you enjoy using **Nitro Markdown**. It is designed to be the *definitive* way to render Markdown in React Native apps, especially those driven by AI.

Happy Coding! 
`;

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
  const rawScrollViewRef = useRef<ScrollView>(null);
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
  const markdownScrollViewRef = useRef<ScrollView>(null);

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
            updateStrategy="raf"
            useTransitionUpdates
          />
        ) : mode === "custom" ? (
          <MarkdownStream
            session={session}
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
        streamOffsetRef.current + CHARS_PER_TICK,
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
