import type {
  MarkdownError,
  MarkdownErrorCode,
  MarkdownErrorPhase,
  MarkdownErrorSource,
  MarkdownParseCompleteResult,
  MarkdownProps,
  MarkdownSession,
  MarkdownStreamProps,
  MarkdownStreamSourceAstDisabledReason,
  ParseCacheStats,
  ParserOptions,
  UseMarkdownStreamStateOptions,
} from "react-native-nitro-markdown";
import {
  MAX_PARSE_INPUT_LENGTH,
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
  maxInputLength: 1000,
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
  errorText: "Parse fehlgeschlagen",
  imageOptions: { remoteImages: "deny", allowedHosts: ["example.com"] },
} satisfies MarkdownProps;

const onParseComplete = (result: MarkdownParseCompleteResult) => {
  const raw: string = result.raw;
  const ast: MarkdownNode = result.ast;
  const text: string = result.text;
  const cacheStats: ParseCacheStats | undefined = result.cacheStats;
  void [raw, ast, text, cacheStats];
};

const streamOptions = {
  session,
  options: parserOptions,
  onError,
  initialParseMode: "async",
} satisfies UseMarkdownStreamStateOptions;

const streamProps = {
  ...streamOptions,
  updateStrategy: "raf",
  incrementalParsing: true,
} satisfies MarkdownStreamProps;

const disabledReason: MarkdownStreamSourceAstDisabledReason = "initializing";
const rootNode: MarkdownNode = parseMarkdown("# Typed");
const leanNode: MarkdownNode = parseMarkdownWithOptions(
  "Olá 👋",
  parserOptions,
);

declare const markdownError: MarkdownError;
const errorCode: MarkdownErrorCode = markdownError.code;
const errorSource: MarkdownErrorSource = markdownError.source;
const inputLimit: number = MAX_PARSE_INPUT_LENGTH;

void [
  markdownProps,
  streamProps,
  disabledReason,
  rootNode,
  leanNode,
  errorCode,
  errorSource,
  inputLimit,
];

// @ts-expect-error — sourceOffsets must be a boolean
const invalidOptions: ParserOptions = { sourceOffsets: "yes" };

const invalidImageOptions: MarkdownProps = {
  children: "# X",
  // @ts-expect-error — remoteImages only accepts "allow" | "deny"
  imageOptions: { remoteImages: "maybe" },
};
void [invalidOptions, invalidImageOptions];
