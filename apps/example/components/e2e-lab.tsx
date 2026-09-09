import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  MarkdownError,
  createMarkdownSession,
  extractPlainText,
  getFlattenedText,
  parseMarkdown,
  parseMarkdownWithOptions,
  type MarkdownNode,
} from "react-native-nitro-markdown";
import { ExampleActionButton } from "./example-ui";
import { EXAMPLE_COLORS } from "../theme";

const SAMPLE = `# E2E parse

Paragraph with **bold**, *italic*, and \`code\`.

- [x] Task
- Item

| A | B |
| --- | --- |
| 1 | 2 |

$E = mc^2$
`;

export function MarkdownE2eLab() {
  const [parseStatus, setParseStatus] = useState("(idle)");
  const [extractStatus, setExtractStatus] = useState("(idle)");
  const [sessionStatus, setSessionStatus] = useState("(idle)");
  const [comparisonStatus, setComparisonStatus] = useState("(idle)");
  const [errorStatus, setErrorStatus] = useState("(idle)");
  const [stressStatus, setStressStatus] = useState("(idle)");

  return (
    <View testID="e2e-lab" style={styles.lab} accessibilityLabel="E2E Lab">
      <Text style={styles.title}>Parser lab</Text>
      <Text style={styles.subtitle}>
        Headless parse, extract, session, input comparison, and parse stress.
      </Text>
      <Text testID="e2e-parse-status" style={styles.result}>
        {parseStatus}
      </Text>
      <Text testID="e2e-extract-status" style={styles.result}>
        {extractStatus}
      </Text>
      <Text testID="e2e-session-status" style={styles.result}>
        {sessionStatus}
      </Text>
      <Text testID="e2e-comparison-status" style={styles.result}>
        {comparisonStatus}
      </Text>
      <Text testID="e2e-error-status" style={styles.result}>
        {errorStatus}
      </Text>
      <Text testID="e2e-stress-result" style={styles.result}>
        {stressStatus}
      </Text>

      <View style={styles.row}>
        <ExampleActionButton
          testID="e2e-parse-run"
          onPress={() => {
            const ast = parseMarkdownWithOptions(SAMPLE, {
              gfm: true,
              math: true,
            });
            const types = new Set<string>();
            const walk = (node: MarkdownNode) => {
              types.add(node.type);
              for (const child of node.children ?? []) {
                walk(child);
              }
            };
            walk(ast);
            const passed =
              ast.type === "document" &&
              ["heading", "list", "table", "math_inline"].every((type) =>
                types.has(type),
              ) &&
              getFlattenedText(ast).includes("Task");
            setParseStatus(passed ? "ok:parse=structure" : "fail:parse=structure");
          }}
        >
          Parse
        </ExampleActionButton>
        <ExampleActionButton
          testID="e2e-extract-run"
          onPress={() => {
            const sample = "**bold** and *italic*";
            const plain = extractPlainText(sample).trim();
            const flat = getFlattenedText(parseMarkdown(sample)).trim();
            setExtractStatus(
              plain === "bold and italic" && flat === plain
                ? "ok:extract=bold and italic"
                : "fail:extract",
            );
          }}
        >
          Extract
        </ExampleActionButton>
        <ExampleActionButton
          testID="e2e-session-run"
          onPress={() => {
            const session = createMarkdownSession("# start");
            let passed = false;
            try {
              session.append("\n\n**more**");
              const appended = session.getAllText();
              session.replace(0, appended.length, "## replaced");
              const replaced = session.getAllText();
              session.reset("# reset");
              passed =
                appended === "# start\n\n**more**" &&
                replaced === "## replaced" &&
                session.getAllText() === "# reset";
            } finally {
              session.dispose();
            }
            setSessionStatus(passed ? "ok:session=append-replace-reset" : "fail:session");
          }}
        >
          Session
        </ExampleActionButton>
      </View>

      <View style={styles.row}>
        <ExampleActionButton
          testID="e2e-comparison-run"
          onPress={() => {
            const before = parseMarkdownWithOptions("hello", {
              gfm: true,
            });
            const after = parseMarkdownWithOptions("PLUGIN hello", {
              gfm: true,
            });
            const passed =
              getFlattenedText(before).trim() === "hello" &&
              getFlattenedText(after).trim() === "PLUGIN hello";
            setComparisonStatus(passed ? "ok:comparison" : "fail:comparison");
          }}
        >
          Compare input
        </ExampleActionButton>
        <ExampleActionButton
          testID="e2e-error-run"
          onPress={() => {
            try {
              parseMarkdownWithOptions("12345", { maxInputLength: 4 });
              setErrorStatus("fail:expected-input-too-large");
            } catch (error) {
              const code =
                error instanceof MarkdownError
                  ? error.code
                  : "unknown";
              setErrorStatus(
                code === "input_too_large"
                  ? "ok:error=input_too_large"
                  : `fail:error=${code}`,
              );
            }
          }}
        >
          Error
        </ExampleActionButton>
        <ExampleActionButton
          testID="e2e-run-stress"
          onPress={() => {
            const payload = `${SAMPLE}\n\n`.repeat(20);
            const started = globalThis.performance?.now?.() ?? Date.now();
            let nodes = 0;
            for (let index = 0; index < 40; index += 1) {
              const marker = `iteration-${index}`;
              const ast = parseMarkdownWithOptions(`${payload}\n# ${marker}`, {
                gfm: true,
                math: true,
              });
              if (
                ast.type !== "document" ||
                !ast.children?.length ||
                !getFlattenedText(ast).includes(marker)
              ) {
                setStressStatus(`fail:parse=${index}`);
                return;
              }
              nodes += ast.children?.length ?? 0;
            }
            const elapsed =
              (globalThis.performance?.now?.() ?? Date.now()) - started;
            setStressStatus(
              `ok:parses=40:blocks=${nodes}:ms=${elapsed.toFixed(1)}`,
            );
          }}
        >
          Stress parse
        </ExampleActionButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  lab: {
    backgroundColor: EXAMPLE_COLORS.surface,
    borderColor: EXAMPLE_COLORS.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  title: {
    color: EXAMPLE_COLORS.text,
    fontSize: 20,
    fontWeight: "700",
  },
  subtitle: {
    color: EXAMPLE_COLORS.textMuted,
    fontSize: 13,
  },
  result: {
    color: EXAMPLE_COLORS.text,
    fontFamily: "Menlo",
    fontSize: 11,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
});
