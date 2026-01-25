import type { HybridObject } from "react-native-nitro-modules";

export interface MarkdownSession extends HybridObject<{
  ios: "swift";
  android: "kotlin";
}> {
  append(chunk: string): void;
  clear(): void;
  getAllText(): string;

  highlightPosition: number;

  addListener(listener: () => void): () => void;
}
