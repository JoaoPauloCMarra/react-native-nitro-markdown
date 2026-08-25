import type { HybridObject } from "react-native-nitro-modules";

export interface ParserOptions {
  gfm?: boolean;
  math?: boolean;
  html?: boolean;
  /**
   * Include `beg`/`end` source ranges in the returned AST.
   * Defaults to true for the public parser API. Set false when the caller
   * does not map nodes back to the source text; native parsing then skips the
   * UTF-16 offset map and omits those fields.
   */
  sourceOffsets?: boolean;
  /**
   * Maximum accepted input length in UTF-8 bytes.
   * Defaults to a hard cap of 10,485,760 bytes. Values above the hard
   * cap are clamped to it. Oversized inputs fail with a typed error instead
   * of being parsed.
   */
  maxInputLength?: number;
  /**
   * Freeze parsed AST nodes and child arrays before returning them.
   * Defaults to false for compatibility with the historical mutable AST.
   */
  freezeAst?: boolean;
}

export interface MarkdownParser extends HybridObject<{
  ios: "c++";
  android: "c++";
}> {
  parse(text: string): string;
  parseWithOptions(text: string, options: ParserOptions): string;
  extractPlainText(text: string): string;
  extractPlainTextWithOptions(text: string, options: ParserOptions): string;
}
