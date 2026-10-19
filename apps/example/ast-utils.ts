import type { MarkdownNode } from "react-native-nitro-markdown";

export function collectNodeTypes(
  node: MarkdownNode,
  types: Set<string> = new Set(),
): Set<string> {
  types.add(node.type);
  node.children?.forEach((child) => collectNodeTypes(child, types));
  return types;
}

export function countNodes(node: MarkdownNode | undefined): number {
  if (!node) return 0;
  return (
    1 + (node.children?.reduce((total, child) => total + countNodes(child), 0) ?? 0)
  );
}

export function hasSourceOffsets(node: MarkdownNode): boolean {
  const offsets = node as MarkdownNode & { beg?: unknown; end?: unknown };
  return (
    typeof offsets.beg === "number" ||
    typeof offsets.end === "number" ||
    (node.children?.some(hasSourceOffsets) ?? false)
  );
}
