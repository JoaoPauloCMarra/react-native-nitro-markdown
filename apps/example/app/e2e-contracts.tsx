import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
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

const FIXTURE_ORIGIN = /^http:\/\/([A-Za-z0-9.-]+|\[[0-9a-fA-F:]+\]):\d{1,5}$/;
const HTTP_IMAGE_PATHS = ["/img/ok.png", "/img/denied.png", "/img/deny.png", "/img/empty.png"] as const;

const httpImage = (origin: string, imagePath: string, title?: string): MarkdownNode => ({
  type: "document",
  children: [{ type: "image", href: `${origin}${imagePath}`, alt: `HTTP image unavailable ${imagePath}`, ...(title ? { title } : {}) }],
});

async function readRequestCounts(origin: string): Promise<Record<string, number>> {
  const response = await fetch(`${origin}/requests`, { cache: "no-store" });
  if (!response.ok) throw new Error(`requests status ${response.status}`);
  const body: unknown = await response.json();
  const counts: Record<string, number> = {};
  for (const imagePath of HTTP_IMAGE_PATHS) {
    const value = body && typeof body === "object" ? (body as Record<string, unknown>)[imagePath] : undefined;
    counts[imagePath] = typeof value === "number" && Number.isInteger(value) ? value : 0;
  }
  return counts;
}

function HttpImageProbe({ origin, host }: { origin: string; host: string }) {
  const [report, setReport] = useState("http:pending;");
  const [images] = useState(() => ({
    ok: httpImage(origin, "/img/ok.png", "HTTP_IMAGE_LOADED"),
    denied: httpImage(origin, "/img/denied.png"),
    deny: httpImage(origin, "/img/deny.png"),
    empty: httpImage(origin, "/img/empty.png"),
  }));
  const [policies] = useState(() => ({
    ok: { allowedHosts: [host] },
    denied: { allowedHosts: ["other.test"] },
    deny: { remoteImages: "deny" as const },
    empty: { allowedHosts: [] },
  }));

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const deadline = Date.now() + 15000;
      let counts = await readRequestCounts(origin);
      while ((counts["/img/ok.png"] ?? 0) < 1 && Date.now() < deadline && !cancelled) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        counts = await readRequestCounts(origin);
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      counts = await readRequestCounts(origin);
      const served = (counts["/img/ok.png"] ?? 0) >= 1 ? "served" : "missing";
      return `http:ok=${served}:denied=${counts["/img/denied.png"]}:deny=${counts["/img/deny.png"]}:empty=${counts["/img/empty.png"]};`;
    };
    run()
      .then((value) => {
        if (!cancelled) setReport(value);
      })
      .catch((error: unknown) => {
        if (!cancelled) setReport(`http:error=${String(error instanceof Error ? error.message : error).replace(/[;:]/g, " ")};`);
      });
    return () => {
      cancelled = true;
    };
  }, [origin]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>HTTP image policy</Text>
      <View testID="http-probe" accessible accessibilityLabel={report} style={styles.resultsProbe} />
      <View testID="http-image-allowed" style={styles.image}>
        <Markdown sourceAst={images.ok} imageOptions={policies.ok}>{""}</Markdown>
      </View>
      <Markdown sourceAst={images.denied} imageOptions={policies.denied}>{""}</Markdown>
      <Markdown sourceAst={images.deny} imageOptions={policies.deny}>{""}</Markdown>
      <Markdown sourceAst={images.empty} imageOptions={policies.empty}>{""}</Markdown>
    </View>
  );
}

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
  const { fixtureUrl } = useLocalSearchParams<{ fixtureUrl?: string }>();
  const fixtureMatch = typeof fixtureUrl === "string" ? FIXTURE_ORIGIN.exec(fixtureUrl) : null;
  const fixtureHost = fixtureMatch?.[1]?.replace(/^\[|\]$/g, "");
  return (
    <ScrollView testID="e2e-contracts-screen" style={styles.screen} contentContainerStyle={{ padding: 16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, gap: 12 }}>
      <Text style={styles.title}>Image policy and session contracts</Text>
      {fixtureMatch && fixtureHost ? <HttpImageProbe origin={fixtureMatch[0]} host={fixtureHost} /> : null}
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
  resultsProbe: { height: 1 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  button: { padding: 10, borderWidth: 1, borderColor: EXAMPLE_COLORS.border, borderRadius: 8 },
});
