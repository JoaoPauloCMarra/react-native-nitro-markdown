import { useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
} from "react-native";
import { parseMarkdown } from "react-native-nitro-markdown";
import { COMPLEX_MARKDOWN } from "../markdown-test-data";
import { Parser } from "commonmark";
import MarkdownIt from "markdown-it";
import { marked } from "marked";
import { useBottomTabHeight } from "../hooks/use-bottom-tab-height";

// Generate a massive string (~237KB) to force the CPU to work
const REPEATED_MARKDOWN = COMPLEX_MARKDOWN.repeat(50);

export default function BenchmarkScreen() {
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const tabHeight = useBottomTabHeight();

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, message]);
  };

  const wait = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  const runBenchmark = async () => {
    setLogs([]);
    setError(null);

    try {
      addLog(
        `📊 Testing ${(REPEATED_MARKDOWN.length / 1024).toFixed(
          1
        )}KB of complex markdown`
      );
      addLog("");
      await wait(100);

      parseMarkdown("warmup");
      const startNitro = global.performance.now();
      parseMarkdown(REPEATED_MARKDOWN);
      const endNitro = global.performance.now();
      const nitroTime = endNitro - startNitro;
      addLog(`🚀 Nitro (C++): ${nitroTime.toFixed(2)}ms`);
      await wait(100);

      const commonmarkParser = new Parser();
      commonmarkParser.parse("warmup");
      const startCommonMark = global.performance.now();
      commonmarkParser.parse(REPEATED_MARKDOWN);
      const endCommonMark = global.performance.now();
      const commonmarkTime = endCommonMark - startCommonMark;
      addLog(`📋 CommonMark (JS): ${commonmarkTime.toFixed(2)}ms`);
      await wait(100);

      const markdownItParser = new MarkdownIt();
      markdownItParser.render("warmup");
      const startMarkdownIt = global.performance.now();
      markdownItParser.render(REPEATED_MARKDOWN);
      const endMarkdownIt = global.performance.now();
      const markdownItTime = endMarkdownIt - startMarkdownIt;
      addLog(`🏗️  Markdown-It (JS): ${markdownItTime.toFixed(2)}ms`);
      await wait(100);

      marked.parse("warmup");
      const startMarked = global.performance.now();
      marked.parse(REPEATED_MARKDOWN);
      const endMarked = global.performance.now();
      const markedTime = endMarked - startMarked;
      addLog(`💨 Marked (JS): ${markedTime.toFixed(2)}ms`);
      addLog("");
      await wait(100);

      const commonmarkSpeedup = (commonmarkTime / nitroTime).toFixed(1);
      const markdownItSpeedup = (markdownItTime / nitroTime).toFixed(1);
      const markedSpeedup = (markedTime / nitroTime).toFixed(1);

      addLog("🏆 SPEED COMPARISON:");
      addLog(`   Nitro vs CommonMark: ${commonmarkSpeedup}x faster`);
      addLog(`   Nitro vs Markdown-It: ${markdownItSpeedup}x faster`);
      addLog(`   Nitro vs Marked: ${markedSpeedup}x faster`);
    } catch (e) {
      console.error("[Benchmark] Error:", e);
      setError(e instanceof Error ? e.message : "Unknown error");
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Benchmark Showdown</Text>
        <Text style={styles.subtitle}>Nitro vs Top 3 JS Libraries</Text>
        <Text style={styles.dataSize}>
          Testing: {(REPEATED_MARKDOWN.length / 1024).toFixed(1)} KB of complex
          markdown
        </Text>
      </View>

      <Pressable style={styles.benchmarkButton} onPress={runBenchmark}>
        <Text style={styles.benchmarkText}>Run Benchmark</Text>
      </Pressable>

      <ScrollView
        style={styles.resultsScroll}
        contentContainerStyle={{ paddingBottom: tabHeight + 20 }}
      >
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Benchmark Error</Text>
            <Text style={styles.errorMessage}>{error}</Text>
          </View>
        ) : logs.length > 0 ? (
          <View style={styles.resultsContainer}>
            {logs.map((log, i) => (
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
            Tap "Run Benchmark" to compare Nitro against the top 3 JavaScript
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
    backgroundColor: "#09090b",
  },
  header: {
    paddingTop: 32,
    paddingHorizontal: 24,
    paddingBottom: 24,
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#f4f4f5",
    marginBottom: 8,
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: "#a1a1aa",
    marginBottom: 8,
    textAlign: "center",
  },
  dataSize: {
    fontSize: 13,
    color: "#22c55e",
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    backgroundColor: "rgba(34, 197, 94, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    overflow: "hidden",
  },
  benchmarkButton: {
    backgroundColor: "#4f46e5",
    marginHorizontal: 24,
    marginBottom: 24,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#4f46e5",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  benchmarkText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  resultsScroll: {
    flex: 1,
    paddingHorizontal: 24,
  },
  resultsContainer: {
    backgroundColor: "#18181b",
    borderRadius: 16,
    padding: 20,
    marginBottom: 40,
    borderWidth: 1,
    borderColor: "#27272a",
  },
  resultText: {
    fontSize: 15,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    marginBottom: 12,
    lineHeight: 22,
    color: "#d4d4d8",
  },
  nitroResult: {
    color: "#4ade80",
    fontWeight: "700",
  },
  commonmarkResult: {
    color: "#f87171",
    fontWeight: "600",
  },
  markdownitResult: {
    color: "#c084fc",
    fontWeight: "600",
  },
  markedResult: {
    color: "#22d3ee",
    fontWeight: "600",
  },
  comparisonHeader: {
    color: "#fbbf24",
    fontSize: 16,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: "#3f3f46",
    paddingTop: 16,
  },
  speedResult: {
    color: "#10b981",
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 0,
  },
  instructionText: {
    color: "#52525b",
    fontSize: 16,
    textAlign: "center",
    marginTop: 60,
    lineHeight: 24,
    paddingHorizontal: 32,
  },
  errorBox: {
    backgroundColor: "#450a0a",
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    borderWidth: 1,
    borderColor: "#7f1d1d",
  },
  errorTitle: {
    color: "#fca5a5",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  errorMessage: {
    color: "#fecaca",
    fontSize: 13,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
  },
});
