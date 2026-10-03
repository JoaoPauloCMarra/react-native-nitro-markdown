import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Markdown,
  createMarkdownSession,
  getFlattenedText,
  useMarkdownStreamState,
  type MarkdownNode,
} from "react-native-nitro-markdown";
import { EXAMPLE_COLORS } from "../theme";

// One RGBA pixel with valid PNG chunk checksums; no network fixture is needed.
const INLINE_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==";
const BLOCKED_IMAGE: MarkdownNode = {
  type: "document",
  children: [{ type: "image", href: INLINE_PNG }],
};
const ALLOWED_IMAGE: MarkdownNode = {
  type: "document",
  children: [{ type: "image", href: INLINE_PNG, alt: "Inline PNG decode failed", title: "INLINE_IMAGE_LOADED" }],
};

function SessionProbe({ transition }: { transition: boolean }) {
  const name = transition ? "transition" : "direct";
  const marker = transition ? "TRANSITION" : "DIRECT";
  const [sessions] = useState(() => ({
    a: createMarkdownSession(`ALPHA_${marker}`),
    b: createMarkdownSession(`BETA_${marker}`),
  }));
  const [stage, setStage] = useState<"a" | "b" | "confirmed">("a");
  const [parseFailed, setParseFailed] = useState(false);
  const [staleCommit, setStaleCommit] = useState(false);
  const onError = useCallback(() => setParseFailed(true), []);
  const state = useMarkdownStreamState({
    session: stage === "a" ? sessions.a : sessions.b,
    useTransitionUpdates: transition,
    updateStrategy: "raf",
    onError,
  });
  const astText = state.sourceAst ? getFlattenedText(state.sourceAst).trim() : "";
  const expected = stage === "a" ? `ALPHA_${marker}` : `BETA_${marker}${stage === "confirmed" ? "_CONFIRMED" : ""}`;

  useLayoutEffect(() => {
    if (stage !== "a" && (state.text.includes("ALPHA_") || astText.includes("ALPHA_"))) {
      // This QA probe must latch committed stale values, even if a later render repairs them.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStaleCommit(true);
    }
  }, [astText, stage, state.text]);
  const report = staleCommit || parseFailed
    ? "FAIL:stale-session-or-parse-error"
    : state.text !== expected || astText !== expected
      ? "initializing"
      : stage === "a" ? "ready:session-A" : stage === "b" ? "PASS:session-B:text+ast:stale=0" : "PASS:current-update:text+ast:stale=0";

  useEffect(() => () => {
    sessions.a.dispose();
    sessions.b.dispose();
  }, [sessions]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{transition ? "Transition updates" : "Direct updates"}</Text>
      <Text testID={transition ? "session-transition-status" : "session-direct-status"}>{`${name}:${report}`}</Text>
      <Markdown sourceAst={state.sourceAst}>{state.text}</Markdown>
      <View style={styles.actions}>
        <Pressable
          testID={transition ? "session-transition-switch" : "session-direct-switch"}
          accessibilityRole="button"
          accessibilityLabel={`Switch ${name} session`}
          disabled={stage !== "a" || report !== "ready:session-A"}
          onPress={() => {
            sessions.a.append("_QUEUED_OLD");
            setStage("b");
          }}
          style={styles.button}
        ><Text>Switch session</Text></Pressable>
        <Pressable
          testID={transition ? "session-transition-confirm" : "session-direct-confirm"}
          accessibilityRole="button"
          accessibilityLabel={`Update current ${name} session`}
          disabled={stage !== "b" || report !== "PASS:session-B:text+ast:stale=0"}
          onPress={() => {
            sessions.a.append("_LATE_OLD");
            sessions.b.append("_CONFIRMED");
            setStage("confirmed");
          }}
          style={styles.button}
        ><Text>Update current session</Text></Pressable>
      </View>
    </View>
  );
}

export default function MarkdownContractReplayScreen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView testID="e2e-contracts-screen" style={styles.screen} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, gap: 12 }}>
      <Text style={styles.title}>Image policy and session contracts</Text>
      <View testID="image-blocked-surface" style={styles.card}>
        <Text>Empty host allowlist</Text>
        <Markdown sourceAst={BLOCKED_IMAGE} imageOptions={{ allowedProtocols: ["data"], allowedHosts: [] }}>{""}</Markdown>
      </View>
      <View testID="image-allowed-surface" style={styles.card}>
        <Text>Omitted host allowlist, inline PNG</Text>
        <View style={styles.image}>
          <Markdown sourceAst={ALLOWED_IMAGE} imageOptions={{ allowedProtocols: ["data"] }}>{""}</Markdown>
        </View>
      </View>
      <SessionProbe transition={false} />
      <SessionProbe transition={true} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: EXAMPLE_COLORS.background },
  card: { gap: 8, padding: 12, backgroundColor: EXAMPLE_COLORS.surface, borderRadius: 12 },
  title: { color: EXAMPLE_COLORS.text, fontSize: 18, fontWeight: "600" },
  image: { width: 96 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { padding: 10, borderWidth: 1, borderColor: EXAMPLE_COLORS.border, borderRadius: 8 },
});
