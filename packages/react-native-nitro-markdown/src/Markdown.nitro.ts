import type { HybridObject } from "react-native-nitro-modules";

export interface ParserOptions {
  gfm?: boolean;
  math?: boolean;
  html?: boolean;
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
