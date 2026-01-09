import type { HybridObject } from "react-native-nitro-modules";

export interface MarkdownSession
  extends HybridObject<{ ios: "swift"; android: "kotlin" }> {
  // Buffer operations
  append(chunk: string): void;
  clear(): void;
  getAllText(): string;

  // Karaoke highlighting (native rendering)
  // Nitro generates getter/setter for properties automatically
  highlightPosition: number;

  // Listener for view updates
  addListener(listener: () => void): () => void;
}
