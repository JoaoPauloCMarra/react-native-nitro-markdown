import type { HybridObject } from "react-native-nitro-modules";

export interface ParserOptions {
  gfm?: boolean;
  math?: boolean;
  html?: boolean;
  sourceOffsets?: boolean;
  /**
   * Maximum accepted input length in UTF-8 bytes.
   * Defaults to a hard cap of 10,485,760 bytes. Values above the hard
   * cap are clamped to it. Oversized inputs fail with a typed error instead
   * of being parsed.
   */
  maxInputLength?: number;
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
