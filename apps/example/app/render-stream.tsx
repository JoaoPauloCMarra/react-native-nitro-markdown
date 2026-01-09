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
  defaultMarkdownTheme,
  type MarkdownSession,
} from "react-native-nitro-markdown";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";

const TOKEN_DELAY_MS = 100;
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

  const session = useMarkdownSession();
  const streamIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamIndexRef = useRef(0);

  const stopStream = useCallback(() => {
    if (streamIntervalRef.current) {
      clearInterval(streamIntervalRef.current);
      streamIntervalRef.current = null;
    }
    setIsStreamMode(false);
  }, []);

  const startStream = useCallback(() => {
    // Reset if starting fresh
    if (!isStreamMode && streamIndexRef.current === 0) {
      session.clear();
    }

    setIsStreamMode(true);

    const chunks = DEMO_TEXT.split(/(\s+|(?=[#\-*`]))/);

    streamIntervalRef.current = setInterval(() => {
      if (streamIndexRef.current >= chunks.length) {
        stopStream();
        return;
      }

      const chunk = chunks[streamIndexRef.current];
      if (chunk) session.getSession().append(chunk);
      streamIndexRef.current++;
    }, TOKEN_DELAY_MS);
  }, [session, stopStream, isStreamMode]);

  const clearStream = useCallback(() => {
    stopStream();
    streamIndexRef.current = 0;
    session.clear();
  }, [stopStream, session]);

  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, []);

  const rawScrollViewRef = useRef<ScrollView>(null);
  const markdownScrollViewRef = useRef<ScrollView>(null);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    return session.getSession().addListener(() => {
      setTick((t) => t + 1);
      // Auto-scroll both views if streaming
      if (isStreamMode) {
        rawScrollViewRef.current?.scrollToEnd({ animated: false });
        markdownScrollViewRef.current?.scrollToEnd({ animated: false });
      }
    });
  }, [session, isStreamMode]);

  const rawText = session.getSession().getAllText();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Token Stream</Text>
          <Text style={styles.subtitle}>Direct Raw vs Markdown Render</Text>
        </View>
        <View style={styles.controlsRow}>
          <Pressable
            style={[styles.btn, isStreamMode && styles.btnActive]}
            onPress={isStreamMode ? stopStream : startStream}
          >
            <Ionicons
              name={isStreamMode ? "pause" : "flash"}
              size={16}
              color={isStreamMode ? "#facc15" : "#fff"}
            />
            <Text style={styles.btnText}>
              {isStreamMode
                ? "Pause"
                : streamIndexRef.current > 0
                ? "Resume"
                : "Start"}
            </Text>
          </Pressable>
          <Pressable style={styles.btnIcon} onPress={clearStream}>
            <Ionicons name="trash" size={18} color="#ef4444" />
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContainer,
          { paddingBottom: tabHeight + 20 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Raw Token Data</Text>
        <View style={styles.card}>
          <ScrollView
            ref={rawScrollViewRef}
            style={styles.cardScroll}
            nestedScrollEnabled
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
            contentContainerStyle={styles.scrollContent}
          >
            {rawText.length === 0 ? (
              <View style={styles.placeholder}>
                <Ionicons name="code-slash-outline" size={32} color="#3f3f46" />
                <Text style={styles.placeholderText}>
                  Waiting for tokens...
                </Text>
              </View>
            ) : (
              <MarkdownStream
                session={session.getSession()}
                theme={{
                  ...defaultMarkdownTheme,
                  colors: {
                    ...defaultMarkdownTheme.colors,
                    text: "#fff",
                  },
                }}
              />
            )}
          </ScrollView>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#060606" },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#1f1f1f",
    backgroundColor: "rgba(6,6,6,0.9)",
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#fff",
    letterSpacing: -0.5,
  },
  subtitle: { fontSize: 12, color: "#71717a", marginTop: 2 },

  controlsRow: { flexDirection: "row", gap: 8 },
  btn: {
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  btnActive: {
    borderColor: "#facc15",
    backgroundColor: "rgba(250, 204, 21, 0.1)",
  },
  btnIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#18181b",
    borderWidth: 1,
    borderColor: "#27272a",
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontSize: 13, fontWeight: "600" },

  scrollContainer: { paddingHorizontal: 16, paddingTop: 16, gap: 16 },
  sectionTitle: {
    color: "#71717a",
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: -8,
    marginLeft: 4,
  },

  card: {
    height: 200,
    backgroundColor: "#111",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1f1f1f",
    overflow: "hidden",
  },
  markdownCard: {
    backgroundColor: "#0a0a0a",
    height: 400,
  },
  cardScroll: { flex: 1 },
  scrollContent: { padding: 16 },

  rawText: {
    color: "#a1a1aa",
    fontFamily: "Menlo",
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
    color: "#3f3f46",
    fontSize: 13,
    fontWeight: "500",
  },
});
