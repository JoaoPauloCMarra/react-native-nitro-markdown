import type { HybridObject } from "react-native-nitro-modules";

export type MarkdownSessionListener = (from: number, to: number) => void;

export interface MarkdownSession extends HybridObject<{
  ios: "swift";
  android: "kotlin";
}> {
  append(chunk: string): number;
  clear(): void;
  getAllText(): string;
  getLength(): number;
  getTextRange(from: number, to: number): string;

  highlightPosition: number;

  addListener(listener: MarkdownSessionListener): () => void;

  /**
   * Replaces the entire buffer with new text and notifies listeners with (0, newLength).
   */
  reset(text: string): void;
  /**
   * Replaces the text in [from, to) with the given text.
   * Returns the new total buffer length.
   */
  replace(from: number, to: number, text: string): number;
}
