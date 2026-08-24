import type { HybridObject } from "react-native-nitro-modules";

export type MarkdownSessionListener = (from: number, to: number) => void;

export interface MarkdownSession extends HybridObject<{
  ios: "c++";
  android: "c++";
}> {
  append(chunk: string): number;
  clear(): void;
  getAllText(): string;
  getLength(): number;
  /**
   * Reads [from, to) in JavaScript UTF-16 code units. An index inside a
   * surrogate pair throws an `invalid_range` error instead of rounding.
   */
  getTextRange(from: number, to: number): string;

  highlightPosition: number;

  addListener(listener: MarkdownSessionListener): () => void;

  /**
   * Replaces the entire buffer with new text and notifies listeners with (0, newLength).
   */
  reset(text: string): void;
  /**
   * Replaces the text in [from, to) JavaScript UTF-16 code units with the
   * given text. An index inside a surrogate pair throws an `invalid_range`
   * error instead of rounding.
   * Returns the new total buffer length.
   */
  replace(from: number, to: number, text: string): number;
}
