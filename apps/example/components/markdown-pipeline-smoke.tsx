import { useCallback, useMemo, useRef, useState } from "react";
import { LogBox, Text } from "react-native";
import {
  Markdown,
  type MarkdownNode,
  type MarkdownPlugin,
  type MarkdownErrorPhase,
  type MarkdownParseCompleteResult,
} from "react-native-nitro-markdown";
import { ExamplePanel } from "./example-ui";

// The smoke plugin throws on purpose to prove the pipeline recovers; keep its
// expected dev warning out of the on-screen LogBox.
LogBox.ignoreLogs(["plugin afterParse (smoke-throwing-plugin) threw"]);

const PIPELINE_SMOKE_MARKDOWN = "SOURCE fixture";
const PIPELINE_SMOKE_OUTPUT = "Markdown plugin pipeline passed";
const PIPELINE_SMOKE_ORDER = [
  "before-high",
  "before-low",
  "after-high",
  "after-throwing",
  "after-continuation",
  "after-low",
];

function replacePipelineSmokeText(
  node: MarkdownNode,
  content: string,
): MarkdownNode {
  if (node.type === "text") return { ...node, content };
  if (!node.children) return node;
  return {
    ...node,
    children: node.children.map((child) =>
      replacePipelineSmokeText(child, content),
    ),
  };
}

export function MarkdownPipelineSmoke() {
  const executionOrderRef = useRef<string[]>([]);
  const errorRef = useRef<{
    message: string;
    phase: MarkdownErrorPhase;
    pluginName?: string;
  } | null>(null);
  const [status, setStatus] = useState("Waiting for rendered Markdown…");
  const plugins = useMemo<MarkdownPlugin[]>(
    () => [
      {
        name: "low-priority",
        priority: 0,
        beforeParse: (markdown) => {
          executionOrderRef.current.push("before-low");
          return `${markdown} continued`;
        },
        afterParse: (ast) => {
          executionOrderRef.current.push("after-low");
          return ast;
        },
      },
      {
        name: "smoke-throwing-plugin",
        priority: 20,
        afterParse: () => {
          executionOrderRef.current.push("after-throwing");
          throw new Error("intentional smoke plugin failure");
        },
      },
      {
        name: "high-priority",
        priority: 30,
        beforeParse: (markdown) => {
          executionOrderRef.current.push("before-high");
          return markdown.replace("SOURCE", "PREPARED");
        },
        afterParse: (ast) => {
          executionOrderRef.current.push("after-high");
          return ast;
        },
      },
      {
        name: "continuation",
        priority: 10,
        afterParse: (ast) => {
          executionOrderRef.current.push("after-continuation");
          return replacePipelineSmokeText(ast, PIPELINE_SMOKE_OUTPUT);
        },
      },
    ],
    [],
  );
  const onError = useCallback(
    (error: Error, phase: MarkdownErrorPhase, pluginName?: string) => {
      errorRef.current = { message: error.message, phase, pluginName };
      if (phase !== "after-plugin" || pluginName !== "smoke-throwing-plugin") {
        setStatus(
          `FAIL — unexpected ${phase} error${pluginName ? ` in ${pluginName}` : ""}`,
        );
      }
    },
    [],
  );
  const onParseComplete = useCallback((result: MarkdownParseCompleteResult) => {
    const reportedError = errorRef.current;
    const passed =
      result.text.includes(PIPELINE_SMOKE_OUTPUT) &&
      reportedError?.message === "intentional smoke plugin failure" &&
      reportedError.phase === "after-plugin" &&
      reportedError.pluginName === "smoke-throwing-plugin" &&
      JSON.stringify(executionOrderRef.current) ===
        JSON.stringify(PIPELINE_SMOKE_ORDER);
    setStatus(
      passed
        ? `PASS — ${PIPELINE_SMOKE_OUTPUT}`
        : "FAIL — priority, transformed output, error reporting, or continuation did not match",
    );
  }, []);

  return (
    <ExamplePanel>
      <Markdown
        plugins={plugins}
        onError={onError}
        onParseComplete={onParseComplete}
        parseCache={false}
      >
        {PIPELINE_SMOKE_MARKDOWN}
      </Markdown>
      <Text testID="plugin-smoke-status">{status}</Text>
    </ExamplePanel>
  );
}
