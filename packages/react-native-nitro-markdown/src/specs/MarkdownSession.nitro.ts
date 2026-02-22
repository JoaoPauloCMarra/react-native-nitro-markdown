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
}
