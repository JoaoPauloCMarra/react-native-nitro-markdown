import type {
  MarkdownErrorPhase,
  MarkdownProps,
  MarkdownSession,
  MarkdownStreamProps,
  MarkdownStreamSourceAstDisabledReason,
  ParserOptions,
  UseMarkdownStreamStateOptions,
} from "react-native-nitro-markdown";
import {
  parseMarkdown,
  parseMarkdownWithOptions,
  type MarkdownNode,
} from "react-native-nitro-markdown/headless";

declare const session: MarkdownSession;

const parserOptions = {
  gfm: true,
  math: true,
  html: false,
  sourceOffsets: false,
} satisfies ParserOptions;

const onError: NonNullable<MarkdownProps["onError"]> = (
  error,
  phase,
  pluginName,
) => {
  const message: string = error.message;
  const errorPhase: MarkdownErrorPhase = phase;
  const source: string | undefined = pluginName;
  void [message, errorPhase, source];
};

const markdownProps = {
  children: "# Typed",
  options: parserOptions,
  onError,
} satisfies MarkdownProps;

const streamOptions = {
  session,
  options: parserOptions,
  onError,
} satisfies UseMarkdownStreamStateOptions;

const streamProps = {
  ...streamOptions,
  updateStrategy: "raf",
  incrementalParsing: true,
} satisfies MarkdownStreamProps;

const disabledReason: MarkdownStreamSourceAstDisabledReason = "parse-error";
const rootNode: MarkdownNode = parseMarkdown("# Typed");
const leanNode: MarkdownNode = parseMarkdownWithOptions(
  "Olá 👋",
  parserOptions,
);

void [
  markdownProps,
  streamProps,
  disabledReason,
  rootNode,
  leanNode,
];
