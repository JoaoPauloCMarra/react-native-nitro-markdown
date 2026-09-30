import type {
  MarkdownError,
  MarkdownErrorCode,
  MarkdownErrorPhase,
  MarkdownErrorSource,
  MarkdownParseCompleteResult,
  MarkdownProps,
  MarkdownRenderers,
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
  parseMarkdownSession,
  parseMarkdownWithOptions,
  type MarkdownNode,
  type MarkdownNodeWithSourceOffsets,
  type MarkdownNodeWithoutSourceOffsets,
} from "react-native-nitro-markdown/headless";
import {
  mathRenderers,
  RaTeXMathBlock,
  RaTeXMathInline,
  type RaTeXMathProps,
} from "react-native-nitro-markdown/math";

declare const session: MarkdownSession;

const parserOptions = {
  gfm: true,
  math: true,
  html: false,
  sourceOffsets: false,
  maxInputLength: 1000,
  freezeAst: true,
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
const offsetNode: MarkdownNodeWithSourceOffsets = parseMarkdown("# Ranged");
const noOffsetNode: MarkdownNodeWithoutSourceOffsets = parseMarkdownWithOptions(
  "# Lean",
  { sourceOffsets: false },
);
const sessionNode: MarkdownNode = parseMarkdownSession(session);
const offset: number = offsetNode.beg;
// @ts-expect-error — sourceOffsets:false does not expose source ranges
const missingOffset: number = noOffsetNode.beg;

declare const markdownError: MarkdownError;
const errorCode: MarkdownErrorCode = markdownError.code;
const errorSource: MarkdownErrorSource = markdownError.source;
const complexityCode: MarkdownErrorCode = "input_too_complex";
// @ts-expect-error — unknown error codes are rejected
const unknownCode: MarkdownErrorCode = "too_complex";
const inputLimit: number = MAX_PARSE_INPUT_LENGTH;
const mutableNode: MarkdownNode = { type: "document", children: [] };
mutableNode.children?.push({ type: "paragraph" });
const parsingCompatibilityCallback: NonNullable<
  MarkdownProps["onParsingInProgress"]
> = () => {};

void [
  markdownProps,
  streamProps,
  disabledReason,
  rootNode,
  leanNode,
  noOffsetNode,
  sessionNode,
  offset,
  complexityCode,
  unknownCode,
  missingOffset,
  errorCode,
  errorSource,
  inputLimit,
  mutableNode,
  parsingCompatibilityCallback,
];

// @ts-expect-error — sourceOffsets must be a boolean
const invalidOptions: ParserOptions = { sourceOffsets: "yes" };

const invalidImageOptions: MarkdownProps = {
  children: "# X",
  // @ts-expect-error — remoteImages only accepts "allow" | "deny"
  imageOptions: { remoteImages: "maybe" },
};
void [invalidOptions, invalidImageOptions];

const mathMarkdownProps = {
  children: "$x^2$",
  renderers: mathRenderers,
} satisfies MarkdownProps;
const combinedRenderers: MarkdownRenderers = {
  ...mathRenderers,
  heading: ({ children }) => children,
};
const mathComponentProps: RaTeXMathProps = { content: "x^2" };
// @ts-expect-error — RaTeX math components take a string content
const invalidMathProps: RaTeXMathProps = { content: 42 };
void [
  mathMarkdownProps,
  combinedRenderers,
  mathComponentProps,
  invalidMathProps,
  RaTeXMathBlock,
  RaTeXMathInline,
];
