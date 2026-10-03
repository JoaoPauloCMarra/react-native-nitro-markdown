import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  MAX_PARSE_INPUT_LENGTH,
  MarkdownError,
  createMarkdownSession,
  extractPlainTextWithOptions,
  getFlattenedText,
  getTextContent,
  parseMarkdown,
  parseMarkdownWithOptions,
  stripSourceOffsets,
  useStream,
  type MarkdownNode,
} from "react-native-nitro-markdown";
import { parseMarkdown as parseHeadlessMarkdown } from "react-native-nitro-markdown/headless";
import { EXAMPLE_COLORS } from "../theme";

const STREAM_TIMESTAMPS: Record<number, number> = { 0: 0, 1: 100, 2: 200 };
const TABLE_MARKDOWN = "| A |\n|---|\n| B |";

type Check = { key: string; run: () => string | Promise<string> };

const errorCode = (error: unknown): string =>
  error instanceof MarkdownError ? error.code : "unexpected";

const hasOffsets = (node: MarkdownNode): boolean => {
  const offsets = node as MarkdownNode & { beg?: unknown; end?: unknown };
  return typeof offsets.beg === "number" && typeof offsets.end === "number";
};

const anyOffsets = (node: MarkdownNode): boolean =>
  hasOffsets(node) || (node.children ?? []).some(anyOffsets);

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (condition()) return true;
    await delay(25);
  }
  return condition();
}

const CHECKS: Check[] = [
  {
    key: "headless",
    run: () => {
      const ast = parseHeadlessMarkdown("# Headless");
      return ast.type === "document" && ast.children?.[0]?.type === "heading" ? "ok" : "fail";
    },
  },
  {
    key: "offsets",
    run: () => {
      const withOffsets = parseMarkdown("# Offsets");
      const withoutOffsets = parseMarkdownWithOptions("# Offsets", { sourceOffsets: false });
      return anyOffsets(withOffsets) && !anyOffsets(withoutOffsets) ? "ok" : "fail";
    },
  },
  {
    key: "freeze",
    run: () => {
      const ast = parseMarkdownWithOptions("# Frozen\n\ntext", { freezeAst: true });
      return Object.isFrozen(ast) && Object.isFrozen(ast.children) && Object.isFrozen(ast.children?.[0]) ? "ok" : "fail";
    },
  },
  {
    key: "strip",
    run: () => {
      const ast = parseMarkdown("# Strip\n\ntext");
      const stripped = stripSourceOffsets(ast);
      return anyOffsets(ast) && !anyOffsets(stripped) ? "ok" : "fail";
    },
  },
  {
    key: "extractopt",
    run: () => {
      const gfmOn = extractPlainTextWithOptions(TABLE_MARKDOWN, { gfm: true });
      const gfmOff = extractPlainTextWithOptions(TABLE_MARKDOWN, { gfm: false });
      const gfmOnAst = parseMarkdownWithOptions(TABLE_MARKDOWN, { gfm: true });
      const gfmOffAst = parseMarkdownWithOptions(TABLE_MARKDOWN, { gfm: false });
      const tableParsed =
        gfmOnAst.children?.[0]?.type === "table" &&
        gfmOn === "A | \nB | \n" &&
        !gfmOn.includes("---") &&
        gfmOn === getFlattenedText(gfmOnAst);
      const tableLiteral =
        gfmOffAst.children?.[0]?.type === "paragraph" &&
        gfmOff.includes("| A |") &&
        gfmOff.includes("|---|") &&
        gfmOff === getFlattenedText(gfmOffAst);
      return tableParsed && tableLiteral ? "ok" : `fail:${tableParsed ? "off" : "on"}`;
    },
  },
  {
    key: "textcontent",
    run: () => {
      const code = parseMarkdown("```\nE2E_CODE\n```").children?.[0];
      return code && getTextContent(code).trim() === "E2E_CODE" ? "ok" : "fail";
    },
  },
  {
    key: "complex",
    run: () => {
      try {
        parseMarkdown(`${"> ".repeat(1000)}x`);
        return "accepted";
      } catch (error) {
        return errorCode(error);
      }
    },
  },
  {
    key: "range",
    run: () => {
      const session = createMarkdownSession("abc");
      try {
        session.replace(2, 1, "x");
        return "accepted";
      } catch (error) {
        return errorCode(error);
      } finally {
        session.dispose();
      }
    },
  },
  {
    key: "destroyed",
    run: () => {
      const session = createMarkdownSession("abc");
      session.dispose();
      try {
        session.append("x");
        return "accepted";
      } catch (error) {
        return errorCode(error);
      }
    },
  },
  {
    key: "buffer",
    run: () => {
      const session = createMarkdownSession();
      try {
        session.append("x".repeat(MAX_PARSE_INPUT_LENGTH + 1));
        return "accepted";
      } catch (error) {
        return errorCode(error);
      } finally {
        session.dispose();
      }
    },
  },
  {
    key: "sess",
    run: () => {
      const session = createMarkdownSession("abc");
      try {
        const length = session.getLength();
        session.highlightPosition = 2;
        const highlight = session.highlightPosition;
        session.clear();
        const cleared = session.getLength() === 0 && session.highlightPosition === 0;
        session.highlightPosition = 1;
        session.reset("xyz!");
        const reset = session.getAllText() === "xyz!" && session.highlightPosition === 0;
        return length === 3 && highlight === 2 && cleared && reset ? "ok" : "fail";
      } finally {
        session.dispose();
      }
    },
  },
  {
    key: "listener",
    run: async () => {
      const session = createMarkdownSession();
      const ranges: string[] = [];
      try {
        const unsubscribe = session.addListener((from, to) => {
          ranges.push(`${from}-${to}`);
        });
        session.append("abc");
        const notified = await waitFor(() => ranges.length > 0, 3000);
        unsubscribe();
        const before = ranges.length;
        session.append("def");
        await delay(400);
        return notified && ranges[0] === "0-3" && ranges.length === before ? "ok" : "fail";
      } finally {
        session.dispose();
      }
    },
  },
];

export default function MarkdownApiReplayScreen() {
  const insets = useSafeAreaInsets();
  const { sync, getSession } = useStream(STREAM_TIMESTAMPS);
  const [tokens, setTokens] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const results: string[] = [];
      for (const check of CHECKS) {
        let value: string;
        try {
          value = await check.run();
        } catch (error) {
          value = `threw:${errorCode(error)}`;
        }
        results.push(`${check.key}=${value}`);
      }
      try {
        sync(150);
        results.push(`sync=${getSession().highlightPosition === 2 ? "ok" : "fail"}`);
      } catch (error) {
        results.push(`sync=threw:${errorCode(error)}`);
      }
      if (!cancelled) setTokens(results);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [getSession, sync]);

  const label = tokens.length === 0 ? "api:pending;" : `api:${tokens.map((token) => `${token};`).join("")}`;

  return (
    <View testID="e2e-api-screen" style={[styles.screen, { paddingTop: insets.top + 16 }]}>
      <View testID="api-probe" accessible accessibilityLabel={label} style={styles.resultsProbe} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.title}>Public API contracts</Text>
        {tokens.map((token) => (
          <Text key={token} style={styles.token}>{token}</Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: EXAMPLE_COLORS.background },
  resultsProbe: { height: 1 },
  content: { paddingHorizontal: 16, gap: 4 },
  title: { color: EXAMPLE_COLORS.text, fontSize: 18, fontWeight: "600", marginBottom: 8 },
  token: { color: EXAMPLE_COLORS.textMuted, fontFamily: "Menlo", fontSize: 12 },
});
