import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useMarkdownSession,
  MarkdownStream,
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

export default function TokenStreamScreen() {
  const tabHeight = useBottomTabHeight();

  const [isStreamMode, setIsStreamMode] = useState(false);
  const [streamOffset, setStreamOffset] = useState(0);
  const [rawText, setRawText] = useState("");

  const session = useMarkdownSession();
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamOffsetRef = useRef(0);
  const rawTextRef = useRef(rawText);

  const stopStream = useCallback(() => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    setIsStreamMode(false);
    setStreamOffset(streamOffsetRef.current);
    const snapshotText = session.getSession().getAllText();
    rawTextRef.current = snapshotText;
    setRawText(snapshotText);
  }, [session]);

  const startStream = useCallback(() => {
    if (!isStreamMode && streamOffsetRef.current === 0) {
      session.clear();
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

      session.getSession().append(chunk);
      streamOffsetRef.current += chunk.length;
    }, TOKEN_DELAY_MS);
  }, [session, stopStream, isStreamMode]);

  const clearStream = useCallback(() => {
    stopStream();
    streamOffsetRef.current = 0;
    setStreamOffset(0);
    setRawText("");
    rawTextRef.current = "";
    session.clear();
  }, [stopStream, session]);

  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, []);

  const rawScrollViewRef = useRef<ScrollView>(null);
  const markdownScrollViewRef = useRef<ScrollView>(null);
  const autoScrollFrameRef = useRef<number | null>(null);

  const scheduleAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current !== null) return;

    autoScrollFrameRef.current = requestAnimationFrame(() => {
      autoScrollFrameRef.current = null;
      rawScrollViewRef.current?.scrollToEnd({ animated: false });
      markdownScrollViewRef.current?.scrollToEnd({ animated: false });
    });
  }, []);

  useEffect(() => {
    rawTextRef.current = rawText;
  }, [rawText]);

  useEffect(() => {
    return () => {
      if (autoScrollFrameRef.current !== null) {
        cancelAnimationFrame(autoScrollFrameRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const pendingRef = { current: false };
    let timer: ReturnType<typeof setTimeout> | null = null;

    const flush = () => {
      timer = null;
      if (!pendingRef.current) return;
      pendingRef.current = false;

      const nextText = session.getSession().getAllText();
      if (nextText !== rawTextRef.current) {
        rawTextRef.current = nextText;
        setRawText(nextText);
      }
      setStreamOffset(streamOffsetRef.current);

      if (isStreamMode) {
        scheduleAutoScroll();
      }
    };

    const unsubscribe = session.getSession().addListener(() => {
      pendingRef.current = true;
      if (!timer) {
        timer = setTimeout(flush, RAW_PREVIEW_SYNC_INTERVAL_MS);
      }
    });

    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [session, isStreamMode, scheduleAutoScroll]);

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
        <ExampleSectionLabel>Raw Token Data</ExampleSectionLabel>
        <ExamplePanel style={styles.card}>
          <ScrollView
            ref={rawScrollViewRef}
            style={styles.cardScroll}
            nestedScrollEnabled
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
            contentContainerStyle={styles.scrollContent}
          >
            {rawText.length === 0 ? (
              <Text style={styles.placeholderText}>Waiting for input...</Text>
            ) : (
              <Text style={styles.rawText}>{rawText}</Text>
            )}
          </ScrollView>
        </ExamplePanel>

        <ExampleSectionLabel>Markdown Renderer</ExampleSectionLabel>
        <ExamplePanel style={[styles.card, styles.markdownCard]}>
          <ScrollView
            ref={markdownScrollViewRef}
            style={styles.cardScroll}
            nestedScrollEnabled
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
            contentContainerStyle={styles.scrollContent}
          >
            {rawText.length === 0 ? (
              <View style={styles.placeholder}>
                <Ionicons
                  name="code-slash-outline"
                  size={32}
                  color={EXAMPLE_COLORS.textMuted}
                />
                <Text style={styles.placeholderText}>
                  Waiting for tokens...
                </Text>
              </View>
            ) : (
              <MarkdownStream
                session={session.getSession()}
                updateStrategy="raf"
                useTransitionUpdates
              />
            )}
          </ScrollView>
        </ExamplePanel>
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
});
