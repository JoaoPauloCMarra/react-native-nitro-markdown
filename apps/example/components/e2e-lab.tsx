import { useEffect, useState } from "react";
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

type LabResults = {
  parse: string;
  extract: string;
  session: string;
  comparison: string;
  error: string;
  stress: string;
};

function runParserLab(): LabResults {
  const results: LabResults = {
    parse: "fail:parse",
    extract: "fail:extract",
    session: "fail:session",
    comparison: "fail:comparison",
    error: "fail:error",
    stress: "fail:stress",
  };

  try {
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
    results.parse = passed ? "ok:parse=structure" : "fail:parse=structure";
  } catch (error) {
    results.parse = `fail:parse=${error instanceof Error ? error.message : String(error)}`;
  }

  try {
    const sample = "**bold** and *italic*";
    const plain = extractPlainText(sample).trim();
    const flat = getFlattenedText(parseMarkdown(sample)).trim();
    results.extract =
      plain === "bold and italic" && flat === plain
        ? "ok:extract=bold and italic"
        : "fail:extract";
  } catch (error) {
    results.extract = `fail:extract=${error instanceof Error ? error.message : String(error)}`;
  }

  const session = createMarkdownSession("# start");
  try {
    session.append("\n\n**more**");
    const appended = session.getAllText();
    session.replace(0, appended.length, "## replaced");
    const replaced = session.getAllText();
    session.reset("# reset");
    results.session =
      appended === "# start\n\n**more**" &&
      replaced === "## replaced" &&
      session.getAllText() === "# reset"
        ? "ok:session=append-replace-reset"
        : "fail:session";
  } catch (error) {
    results.session = `fail:session=${error instanceof Error ? error.message : String(error)}`;
  } finally {
    session.dispose();
  }

  try {
    const before = parseMarkdownWithOptions("hello", { gfm: true });
    const after = parseMarkdownWithOptions("PLUGIN hello", { gfm: true });
    results.comparison =
      getFlattenedText(before).trim() === "hello" &&
      getFlattenedText(after).trim() === "PLUGIN hello"
        ? "ok:comparison"
        : "fail:comparison";
  } catch (error) {
    results.comparison = `fail:comparison=${error instanceof Error ? error.message : String(error)}`;
  }

  try {
    parseMarkdownWithOptions("12345", { maxInputLength: 4 });
    results.error = "fail:expected-input-too-large";
  } catch (error) {
    const code = error instanceof MarkdownError ? error.code : "unknown";
    results.error =
      code === "input_too_large"
        ? "ok:error=input_too_large"
        : `fail:error=${code}`;
  }

  try {
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
        results.stress = `fail:parse=${index}`;
        return results;
      }
      nodes += ast.children?.length ?? 0;
    }
    const elapsed =
      (globalThis.performance?.now?.() ?? Date.now()) - started;
    results.stress = `ok:parses=40:blocks=${nodes}:ms=${elapsed.toFixed(1)}`;
  } catch (error) {
    results.stress = `fail:stress=${error instanceof Error ? error.message : String(error)}`;
  }

  return results;
}

export function MarkdownE2eLab() {
  const [results, setResults] = useState<LabResults | null>(null);

  useEffect(() => {
    setResults(runParserLab());
  }, []);

  const parseStatus = results?.parse ?? "running";
  const extractStatus = results?.extract ?? "running";
  const sessionStatus = results?.session ?? "running";
  const comparisonStatus = results?.comparison ?? "running";
  const errorStatus = results?.error ?? "running";
  const stressStatus = results?.stress ?? "running";

  return (
    <View testID="e2e-lab" style={styles.lab} accessibilityLabel="E2E Lab">
      <Text style={styles.title}>Parser lab</Text>
      <Text style={styles.subtitle}>
        Auto-runs on open. Buttons re-run individual cases.
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
          onPress={() => setResults(runParserLab())}
        >
          Re-run all
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
