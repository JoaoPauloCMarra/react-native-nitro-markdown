import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import {
  Markdown,
  MarkdownStream,
  createMarkdownSession,
  darkMarkdownTheme,
  minimalMarkdownTheme,
  type AstTransform,
  type CustomRenderers,
  type MarkdownPlugin,
} from "react-native-nitro-markdown";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { EXAMPLE_COLORS } from "../theme";

const KITCHEN_SINK = `# Kitchen sink

Paragraph with **bold**, *italic*, ***both***, ~~strike~~, \`code\`, and a [link](https://nitro.dev).

> Blockquote with **emphasis**.

## Lists

- Unordered
  - Nested
- [x] Done
- [ ] Todo

1. Ordered one
2. Ordered two

## Table

| Feature | Status |
| --- | ---: |
| Tables | yes |
| Math | yes |

## Code

\`\`\`ts
function render(): string {
  return "nitro";
}
\`\`\`

## Math

Inline $E = mc^2$ and block:

$$\\sum_{n=1}^{n} n = \\frac{n(n+1)}{2}$$

---
`;

const LONG_DOC = Array.from({ length: 48 }, (_, index) => {
  return `## Section ${index + 1}

Paragraph ${index + 1} with **bold**, *italic*, and a [link](https://example.com/${index}).

- Item A
- Item B
`;
}).join("\n");

const UNICODE = `# 日本語 · café · emoji

مرحبا **العالم** and Ελληνικά.

- 🚀 Launch
- 日本語リスト
`;

const HTML_SAMPLE = `# HTML

Hello <span>inline</span>

<div>
block
</div>
`;

const CUSTOM_RENDERERS: CustomRenderers = {
  heading: ({ children }) => (
    <Text
      testID="e2e-render-custom-heading"
      style={{ color: "#7c3aed", fontSize: 22, fontWeight: "800" }}
    >
      {children}
    </Text>
  ),
};

const IDENTITY_AST_TRANSFORM: AstTransform = (ast) => ast;

const E2E_PLUGINS: MarkdownPlugin[] = [
  {
    name: "e2e-before",
    priority: 10,
    beforeParse: (markdown) => `${markdown}\n\n_plugin_`,
  },
];

type SpecimenId =
  | "kitchen"
  | "dark"
  | "minimal"
  | "custom"
  | "virtualized"
  | "unicode"
  | "html"
  | "plugin";

const SPECIMEN_IDS: readonly SpecimenId[] = [
  "kitchen",
  "dark",
  "minimal",
  "custom",
  "virtualized",
  "unicode",
  "html",
  "plugin",
];

export default function MarkdownE2eRenderScreen() {
  const insets = useSafeAreaInsets();
  const [generation, setGeneration] = useState(0);
  const [readyIds, setReadyIds] = useState<string[]>([]);
  const readyIdsRef = useRef<string[]>([]);
  const [elapsed, setElapsed] = useState("(idle)");
  const [streamStatus, setStreamStatus] = useState("(idle)");
  const [session] = useState(() => createMarkdownSession(""));
  const [startedAt, setStartedAt] = useState(
    () => globalThis.performance?.now?.() ?? Date.now(),
  );

  const markReady = useCallback((id: string) => {
    if (readyIdsRef.current.includes(id)) {
      return;
    }
    const next = [...readyIdsRef.current, id];
    readyIdsRef.current = next;
    setReadyIds(next);
    if (next.length === SPECIMEN_IDS.length) {
      const ms = (globalThis.performance?.now?.() ?? Date.now()) - startedAt;
      setElapsed(`ok:ready=${next.length}/${SPECIMEN_IDS.length}:ms=${ms.toFixed(1)}`);
    }
  }, [startedAt]);

  const parseCompleteCallbacks = useMemo(
    () =>
      ({
        kitchen: () => markReady("kitchen"),
        dark: () => markReady("dark"),
        minimal: () => markReady("minimal"),
        custom: () => markReady("custom"),
        virtualized: () => markReady("virtualized"),
        unicode: () => markReady("unicode"),
        html: () => markReady("html"),
        plugin: () => markReady("plugin"),
      }) satisfies Record<SpecimenId, () => void>,
    [markReady],
  );

  const renderSpecimen = useCallback(({ item }: { item: SpecimenId }) => {
    switch (item) {
      case "kitchen":
        return (
          <Specimen
            id="kitchen"
            generation={generation}
            title="Kitchen sink"
          >
            <Markdown
              options={{ gfm: true, math: true }}
              onParseComplete={parseCompleteCallbacks.kitchen}
            >
              {KITCHEN_SINK}
            </Markdown>
          </Specimen>
        );
      case "dark":
        return (
          <Specimen
            id="dark"
            generation={generation}
            title="Dark theme"
            dark
          >
            <Markdown
              theme={darkMarkdownTheme}
              stylingStrategy="opinionated"
              options={{ gfm: true, math: true }}
              onParseComplete={parseCompleteCallbacks.dark}
            >
              {KITCHEN_SINK}
            </Markdown>
          </Specimen>
        );
      case "minimal":
        return (
          <Specimen
            id="minimal"
            generation={generation}
            title="Minimal theme"
          >
            <Markdown
              theme={minimalMarkdownTheme}
              stylingStrategy="minimal"
              options={{ gfm: true }}
              onParseComplete={parseCompleteCallbacks.minimal}
            >
              {KITCHEN_SINK}
            </Markdown>
          </Specimen>
        );
      case "custom":
        return (
          <Specimen
            id="custom"
            generation={generation}
            title="Custom heading renderer"
          >
            <Markdown
              renderers={CUSTOM_RENDERERS}
              options={{ gfm: true }}
              onParseComplete={parseCompleteCallbacks.custom}
            >
              {"# Custom heading\n\nBody with a custom heading renderer."}
            </Markdown>
          </Specimen>
        );
      case "virtualized":
        return (
          <Specimen
            id="virtualized"
            generation={generation}
            title="Virtualized long document"
            tall
          >
            <Markdown
              options={{ gfm: true }}
              virtualize={true}
              virtualizationMinBlocks={8}
              virtualization={{
                initialNumToRender: 8,
                maxToRenderPerBatch: 6,
                windowSize: 5,
              }}
              onParseComplete={parseCompleteCallbacks.virtualized}
            >
              {LONG_DOC}
            </Markdown>
          </Specimen>
        );
      case "unicode":
        return (
          <Specimen
            id="unicode"
            generation={generation}
            title="Unicode / mixed scripts"
          >
            <Markdown
              options={{ gfm: true }}
              onParseComplete={parseCompleteCallbacks.unicode}
            >
              {UNICODE}
            </Markdown>
          </Specimen>
        );
      case "html":
        return (
          <Specimen id="html" generation={generation} title="Raw HTML">
            <Markdown
              options={{ html: true }}
              onParseComplete={parseCompleteCallbacks.html}
            >
              {HTML_SAMPLE}
            </Markdown>
          </Specimen>
        );
      case "plugin":
        return (
          <Specimen
            id="plugin"
            generation={generation}
            title="astTransform plugin"
          >
            <Markdown
              options={{ gfm: true }}
              astTransform={IDENTITY_AST_TRANSFORM}
              plugins={E2E_PLUGINS}
              onParseComplete={parseCompleteCallbacks.plugin}
            >
              {"# Plugin specimen"}
            </Markdown>
          </Specimen>
        );
    }
  }, [generation, parseCompleteCallbacks]);

  return (
    <FlatList<SpecimenId>
      testID="e2e-render-screen"
      accessibilityLabel="E2E render wall"
      data={SPECIMEN_IDS}
      extraData={generation}
      initialNumToRender={SPECIMEN_IDS.length}
      keyExtractor={(item) => item}
      renderItem={renderSpecimen}
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + 20,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 16,
        gap: 16,
      }}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text testID="e2e-ready" style={styles.ready}>
            e2e-ready
          </Text>
          <Text style={styles.title}>Render wall</Text>
          <Text style={styles.subtitle}>
            Consumer-shaped markdown: themes, custom renderers, virtualization,
            unicode, HTML, plugins, and a stream burst.
          </Text>
          <Text testID="e2e-render-ready-count" style={styles.metric}>
            {elapsed === "(idle)"
              ? `ready=${readyIds.length}/${SPECIMEN_IDS.length}`
              : elapsed}
          </Text>
          <Text testID="e2e-stream-status" style={styles.metric}>
            {streamStatus}
          </Text>
          <View style={styles.row}>
            <Pressable
              testID="e2e-render-remount"
              accessibilityRole="button"
              accessibilityLabel="Remount specimens"
              onPress={() => {
                readyIdsRef.current = [];
                setStartedAt(globalThis.performance?.now?.() ?? Date.now());
                setReadyIds([]);
                setElapsed("(idle)");
                setStreamStatus("(idle)");
                session.reset("");
                setGeneration((value) => value + 1);
              }}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Remount all</Text>
            </Pressable>
            <Pressable
              testID="e2e-stream-burst"
              accessibilityRole="button"
              accessibilityLabel="Burst stream"
              onPress={() => {
                const started = globalThis.performance?.now?.() ?? Date.now();
                session.reset("");
                for (let index = 0; index < 24; index += 1) {
                  session.append(`Token **${index}** `);
                }
                const ms = (globalThis.performance?.now?.() ?? Date.now()) - started;
                setStreamStatus(
                  `ok:burst=${session.getAllText().length}:ms=${ms.toFixed(1)}`,
                );
              }}
              style={styles.button}
            >
              <Text style={styles.buttonText}>Stream burst</Text>
            </Pressable>
          </View>
        </View>
      }
      ListFooterComponent={
        <View testID="e2e-render-stream" style={styles.card}>
          <Text style={styles.cardTitle}>Stream</Text>
          <MarkdownStream
            key={`stream-${generation}`}
            session={session}
            options={{ gfm: true }}
            updateStrategy="raf"
          />
        </View>
      }
    />
  );
}

function Specimen({
  id,
  generation,
  title,
  children,
  dark,
  tall,
}: {
  id: SpecimenId;
  generation: number;
  title: string;
  children: ReactNode;
  dark?: boolean;
  tall?: boolean;
}) {
  return (
    <View
      key={`${id}-${generation}`}
      testID={`e2e-render-${id}`}
      style={[styles.card, dark && styles.cardDark, tall && styles.cardTall]}
    >
      <Text style={[styles.cardTitle, dark && styles.cardTitleDark]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: EXAMPLE_COLORS.background,
  },
  header: {
    gap: 16,
  },
  ready: {
    color: "#059669",
    fontFamily: "Menlo",
    fontSize: 12,
  },
  title: {
    color: EXAMPLE_COLORS.text,
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 14,
  },
  metric: {
    color: EXAMPLE_COLORS.text,
    fontFamily: "Menlo",
    fontSize: 12,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  button: {
    backgroundColor: EXAMPLE_COLORS.surface,
    borderColor: EXAMPLE_COLORS.border,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: {
    color: EXAMPLE_COLORS.text,
    fontWeight: "700",
  },
  card: {
    backgroundColor: EXAMPLE_COLORS.surface,
    borderColor: EXAMPLE_COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  cardDark: {
    backgroundColor: "#0f172a",
    borderColor: "#1e293b",
  },
  cardTall: {
    minHeight: 280,
  },
  cardTitle: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 8,
  },
  cardTitleDark: {
    color: "#94a3b8",
  },
});
