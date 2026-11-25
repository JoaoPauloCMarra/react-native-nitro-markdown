import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Markdown,
  MarkdownStream,
  createMarkdownSession,
  parseMarkdown,
  type MarkdownSession,
} from "react-native-nitro-markdown";
import { EXAMPLE_COLORS } from "../theme";

// Flush benchmark: time from session.append to the layout of the grown
// document, the latency a streaming user waits on. Results go to the probe
// label so agent-device can read them from a release build.

const PARAGRAPH = (index: number) =>
  `Paragraph ${index} with some **bold** text and a longer plain sentence that follows it.\n\n`;
const PLAIN_CHUNK =
  " plain words that keep going without any markdown syntax so the last paragraph wraps onto a new line";
const SIZES_KB = [80, 240] as const;
// ABBA order per size cancels drift (GC, heap growth) between the two modes.
const MODES = [false, true, true, false] as const;
const APPENDS = 12;
const SETTLE_MS = 120;
const PARSE_RUNS = 10;
const MOUNT_RUNS = 5;

type Config = { sizeKb: number; streaming: boolean; pass: "a" | "b" };
// "plain" appends to a tail that holds `**bold**`; "clean" to a tail with no
// syntax characters, the case where the stream view can append in JS.
type Phase = "structural" | "plain" | "clean";
const PHASES: Phase[] = ["structural", "plain", "clean"];
const TAIL_BY_PHASE: Record<Exclude<Phase, "structural">, string> = {
  plain: "Tail paragraph with some **bold** text",
  clean: "Tail paragraph with plain words only",
};

const CONFIGS: Config[] = SIZES_KB.flatMap((sizeKb) =>
  MODES.map((streaming, index) => ({ sizeKb, streaming, pass: index < 2 ? "a" : "b" })),
);

function buildDocument(sizeKb: number): { text: string; count: number } {
  let text = "";
  let count = 0;
  while (text.length < sizeKb * 1024) {
    text += PARAGRAPH(count);
    count += 1;
  }
  return { text, count };
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function median(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

function format(samples: number[]): string {
  if (samples.length === 0) return "none";
  const sorted = [...samples].sort((a, b) => a - b);
  return `${median(sorted).toFixed(1)}[${sorted[0]!.toFixed(1)}..${sorted[sorted.length - 1]!.toFixed(1)}]`;
}

export default function BenchStreamScreen() {
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState("bench:pending;");
  const [active, setActive] = useState<{ config: Config; session: MarkdownSession; key: number } | null>(null);
  const [mountDoc, setMountDoc] = useState<{ text: string; key: number } | null>(null);
  const layoutWaiter = useRef<{ height: number; resolve: (at: number) => void } | null>(null);
  const lastHeight = useRef(0);
  const mountWaiter = useRef<((at: number) => void) | null>(null);

  const onStreamLayout = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    const at = global.performance.now();
    lastHeight.current = height;
    const waiter = layoutWaiter.current;
    if (waiter && height > waiter.height) {
      layoutWaiter.current = null;
      waiter.resolve(at);
    }
  }, []);

  const onMountLayout = useCallback(() => {
    const at = global.performance.now();
    mountWaiter.current?.(at);
    mountWaiter.current = null;
  }, []);

  const waitForGrowth = useCallback(
    (timeoutMs: number) =>
      new Promise<number | null>((resolve) => {
        const timer = setTimeout(() => {
          layoutWaiter.current = null;
          resolve(null);
        }, timeoutMs);
        layoutWaiter.current = {
          height: lastHeight.current,
          resolve: (at) => {
            clearTimeout(timer);
            resolve(at);
          },
        };
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    const results: string[] = [];
    let failures = 0;

    const runConfig = async (config: Config, key: number) => {
      const { text, count } = buildDocument(config.sizeKb);
      const session = createMarkdownSession(text);
      lastHeight.current = 0;
      const mounted = waitForGrowth(20000);
      setActive({ config, session, key });
      if ((await mounted) === null) failures += 1;
      await wait(400);
      const label = `s${config.sizeKb}${config.streaming ? "on" : "off"}${config.pass}`;

      // JS-thread cost of one flush parse, below the frame quantization of
      // the append-to-layout samples.
      const nativeMs: number[] = [];
      const jsonMs: number[] = [];
      for (let run = 0; run < PARSE_RUNS; run += 1) {
        const startedAt = global.performance.now();
        const json = config.streaming ? session.parseStreamView({}, {}) : session.parse();
        const parsedAt = global.performance.now();
        JSON.parse(json);
        nativeMs.push(parsedAt - startedAt);
        jsonMs.push(global.performance.now() - parsedAt);
      }
      results.push(`${label}native=${format(nativeMs)}`, `${label}json=${format(jsonMs)}`);

      const measure = async (phase: Phase): Promise<number[]> => {
        const samples: number[] = [];
        if (phase !== "structural") {
          session.append(`${TAIL_BY_PHASE[phase]} ${count}`);
          await wait(SETTLE_MS * 2);
        }
        for (let index = 0; index <= APPENDS; index += 1) {
          const chunk = phase === "structural" ? PARAGRAPH(count + index) : PLAIN_CHUNK;
          const grown = waitForGrowth(5000);
          const startedAt = global.performance.now();
          session.append(chunk);
          const at = await grown;
          if (at === null) failures += 1;
          else if (index > 0) samples.push(at - startedAt);
          await wait(SETTLE_MS);
          if (cancelled) return samples;
        }
        return samples;
      };

      for (const phase of PHASES) {
        const samples = await measure(phase);
        results.push(`${label}${phase === "structural" ? "" : phase}=${format(samples)}`);
        if (phase === "plain") session.append("\n\n");
      }
      setActive(null);
      await wait(200);
      session.dispose();
    };

    const runStatic = async () => {
      const { text } = buildDocument(80);
      parseMarkdown("warmup");
      const parseSamples: number[] = [];
      for (let run = 0; run < PARSE_RUNS; run += 1) {
        const startedAt = global.performance.now();
        const ast = parseMarkdown(text);
        parseSamples.push(global.performance.now() - startedAt);
        if (!ast.children?.length) failures += 1;
      }
      const mountSamples: number[] = [];
      for (let run = 0; run < MOUNT_RUNS; run += 1) {
        const mounted = new Promise<number>((resolve) => {
          mountWaiter.current = resolve;
        });
        const startedAt = global.performance.now();
        setMountDoc({ text, key: run });
        mountSamples.push((await mounted) - startedAt);
        setMountDoc(null);
        await wait(300);
      }
      results.push(`parse80=${format(parseSamples)}`, `mount80=${format(mountSamples)}`);
    };

    void (async () => {
      await wait(500);
      setStatus("bench:running;");
      await runStatic();
      for (const [index, config] of CONFIGS.entries()) {
        if (cancelled) return;
        await runConfig(config, index);
      }
      if (!cancelled) setStatus(`bench:done;fail=${failures};${results.map((r) => `${r};`).join("")}`);
    })();

    return () => {
      cancelled = true;
    };
  }, [waitForGrowth]);

  return (
    <View testID="bench-stream-screen" style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <View testID="bench-stream-probe" accessible accessibilityLabel={status} style={styles.probe} />
      <Text style={styles.status}>{status.split(";").join("\n")}</Text>
      <ScrollView style={styles.scroll}>
        {mountDoc ? (
          <View key={mountDoc.key} onLayout={onMountLayout}>
            <Markdown>{mountDoc.text}</Markdown>
          </View>
        ) : null}
        {active ? (
          <View key={active.key} onLayout={onStreamLayout}>
            <MarkdownStream
              session={active.session}
              streaming={active.config.streaming}
              updateStrategy="interval"
              updateIntervalMs={0}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: EXAMPLE_COLORS.background },
  probe: { height: 1 },
  status: { color: EXAMPLE_COLORS.text, fontSize: 11, paddingHorizontal: 12 },
  scroll: { flex: 1 },
});
