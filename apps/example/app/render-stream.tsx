import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  useMarkdownSession,
  MarkdownStream,
} from "react-native-nitro-markdown";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";
import { EXAMPLE_COLORS } from "../theme";

const TOKEN_DELAY_MS = 150;
const UI_UPDATE_INTERVAL_MS = 60;
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
    // Reset if starting fresh
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
        timer = setTimeout(flush, UI_UPDATE_INTERVAL_MS);
      }
    });

    return () => {
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, [session, isStreamMode, scheduleAutoScroll]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Token Stream</Text>
          <Text style={styles.subtitle}>
            Direct Raw vs Markdown Render ({TOKEN_DELAY_MS}ms delay)
          </Text>
        </View>
        <View style={styles.controlsRow}>
          <Pressable
            style={[styles.btn, isStreamMode && styles.btnActive]}
            onPress={isStreamMode ? stopStream : startStream}
          >
            <Ionicons
              name={isStreamMode ? "pause" : "flash"}
              size={16}
              color={isStreamMode ? EXAMPLE_COLORS.accent : EXAMPLE_COLORS.text}
            />
            <Text style={styles.btnText}>
              {isStreamMode ? "Pause" : streamOffset > 0 ? "Resume" : "Start"}
            </Text>
          </Pressable>
          <Pressable style={styles.btnIcon} onPress={clearStream}>
            <Ionicons name="trash" size={18} color={EXAMPLE_COLORS.danger} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContainer,
          { paddingBottom: tabHeight + 20 },
        ]}
        bounces={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Streaming Performance Lab</Text>
          <Text style={styles.heroSubtitle}>
            Compare raw token input with rendered markdown in real time.
          </Text>
        </View>
        <Text style={styles.sectionTitle}>Raw Token Data</Text>
        <View style={styles.card}>
          <ScrollView
            ref={rawScrollViewRef}
            style={styles.cardScroll}
            nestedScrollEnabled
            bounces={false}
            contentContainerStyle={styles.scrollContent}
          >
            {rawText.length === 0 ? (
              <Text style={styles.placeholderText}>Waiting for input...</Text>
            ) : (
              <Text style={styles.rawText}>{rawText}</Text>
            )}
          </ScrollView>
        </View>

        <Text style={styles.sectionTitle}>Markdown Renderer</Text>
        <View style={[styles.card, styles.markdownCard]}>
          <ScrollView
            ref={markdownScrollViewRef}
            style={styles.cardScroll}
            nestedScrollEnabled
            bounces={false}
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
                updateIntervalMs={UI_UPDATE_INTERVAL_MS}
                updateStrategy="raf"
                useTransitionUpdates
              />
            )}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EXAMPLE_COLORS.background },
  header: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    flexDirection: "column",
    alignItems: "flex-start",
    backgroundColor: EXAMPLE_COLORS.surface,
    boxShadow: `0px 1px 8px ${EXAMPLE_COLORS.text}14`,
  },
  headerCopy: {
    width: "100%",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: EXAMPLE_COLORS.text,
    letterSpacing: -0.5,
  },
  subtitle: { fontSize: 12, color: EXAMPLE_COLORS.textMuted, marginTop: 2 },
  hero: {
    backgroundColor: EXAMPLE_COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
    padding: 14,
    marginBottom: 6,
    boxShadow: `0px 8px 16px ${EXAMPLE_COLORS.text}12`,
  },
  heroTitle: {
    color: EXAMPLE_COLORS.text,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  heroSubtitle: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 13,
    marginTop: 4,
    lineHeight: 18,
  },

  controlsRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    width: "100%",
    marginTop: 12,
  },
  btn: {
    flex: 1,
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 18,
    backgroundColor: EXAMPLE_COLORS.surface,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnActive: {
    borderColor: EXAMPLE_COLORS.accent,
    backgroundColor: EXAMPLE_COLORS.accentSoft,
  },
  btnIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: EXAMPLE_COLORS.surface,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: EXAMPLE_COLORS.text, fontSize: 13, fontWeight: "600" },

  scrollContainer: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  sectionTitle: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: -8,
    marginLeft: 4,
  },

  card: {
    height: 200,
    backgroundColor: EXAMPLE_COLORS.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: EXAMPLE_COLORS.border,
    overflow: "hidden",
    boxShadow: `0px 8px 16px ${EXAMPLE_COLORS.text}12`,
  },
  markdownCard: {
    backgroundColor: EXAMPLE_COLORS.surface,
    height: 400,
  },
  cardScroll: { flex: 1 },
  scrollContent: { padding: 16 },

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
