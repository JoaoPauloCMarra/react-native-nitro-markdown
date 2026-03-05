/**
 * Headless entry point for react-native-nitro-markdown.
 * Use this when you want to build your own renderer and minimize bundle size.
 *
 * @example
 * ```tsx
 * import { parseMarkdown } from 'react-native-nitro-markdown/headless';
 *
 * const ast = parseMarkdown('# Hello World');
 * // Build your own renderer using the AST
 * ```
 */
import { NitroModules } from "react-native-nitro-modules";
import type { MarkdownParser, ParserOptions } from "./Markdown.nitro";

export type { ParserOptions } from "./Markdown.nitro";

/**
 * Represents a node in the Markdown AST (Abstract Syntax Tree).
 * Each node has a type and optional properties depending on the node type.
 */
export type MarkdownNode = {
  /** The type of markdown element this node represents. Used to decide how to render the node. */
  type:
    | "document"
    | "heading"
    | "paragraph"
    | "text"
    | "bold"
    | "italic"
    | "strikethrough"
    | "link"
    | "image"
    | "code_inline"
    | "code_block"
    | "blockquote"
    | "horizontal_rule"
    | "line_break"
    | "soft_break"
    | "table"
    | "table_head"
    | "table_body"
    | "table_row"
    | "table_cell"
    | "list"
    | "list_item"
    | "task_list_item"
    | "math_inline"
    | "math_block"
    | "html_block"
    | "html_inline";
  /** Text content for text, code, and similar nodes. */
  content?: string;
  /** Heading level (1-6) for heading nodes. */
  level?: number;
  /** URL for link and image nodes. */
  href?: string;
  /** Title attribute for link and image nodes. */
  title?: string;
  /** Alt text for image nodes. */
  alt?: string;
  /** Programming language for code blocks (e.g., 'typescript', 'javascript'). */
  language?: string;
  /** Whether a list is ordered (numbered) or unordered. */
  ordered?: boolean;
  /** The starting number for ordered lists. */
  start?: number;
  /** Whether a task list item is currently checked. */
  checked?: boolean;
  /** Whether a table cell is part of the header row. */
  isHeader?: boolean;
  /** Text alignment for table cells: 'left', 'center', or 'right'. */
  align?: string;
  /** Source start offset in original markdown text (when provided by native parser). */
  beg?: number;
  /** Source end offset in original markdown text (when provided by native parser). */
  end?: number;
  /** Nested child nodes for hierarchical elements like paragraphs, lists, and tables. */
  children?: MarkdownNode[];
};

let MarkdownParserModule: MarkdownParser | null = null;
try {
  MarkdownParserModule = NitroModules.createHybridObject<MarkdownParser>("MarkdownParser");
} catch (e) {
  if (__DEV__) {
    console.error('[NitroMarkdown] Failed to create native MarkdownParser:', e);
  }
}
export { MarkdownParserModule };

/**
 * Parse markdown text into an AST.
 * @param text - The markdown text to parse
 * @returns The root node of the parsed AST
 */
export function parseMarkdown(text: string): MarkdownNode;
/**
 * Parse markdown text with custom options.
 * @param text - The markdown text to parse
 * @param options - Parser options (gfm, math)
 * @returns The root node of the parsed AST
 */
export function parseMarkdown(text: string, options: ParserOptions): MarkdownNode;
export function parseMarkdown(text: string, options?: ParserOptions): MarkdownNode {
  if (options != null) {
    return parseMarkdownWithOptions(text, options);
  }
  if (MarkdownParserModule != null && typeof MarkdownParserModule.parse === "function") {
    const jsonStr = MarkdownParserModule.parse(text);
    return JSON.parse(jsonStr) as MarkdownNode;
  }

  if (__DEV__) {
    console.error(
      '[NitroMarkdown] parseMarkdown: Native parser module is not available. ' +
      'Check that react-native-nitro-markdown is properly installed and linked. ' +
      'Returning empty AST as fallback.'
    );
  }
  return { type: "document", children: [] };
}

/**
 * Parse markdown text with custom options.
 * @param text - The markdown text to parse
 * @param options - Parser options (gfm, math)
 * @returns The root node of the parsed AST
 */
export function parseMarkdownWithOptions(
  text: string,
  options: ParserOptions,
): MarkdownNode {
  if (MarkdownParserModule != null && typeof MarkdownParserModule.parseWithOptions === "function") {
    const jsonStr = MarkdownParserModule.parseWithOptions(text, options);
    return JSON.parse(jsonStr) as MarkdownNode;
  }

  if (__DEV__) {
    console.error(
      '[NitroMarkdown] parseMarkdownWithOptions: Native parser module is not available. ' +
      'Check that react-native-nitro-markdown is properly installed and linked. ' +
      'Returning empty AST as fallback.'
    );
  }
  return { type: "document", children: [] };
}

/**
 * Parse markdown and return flattened plain text directly from native parser.
 * Useful for search/indexing flows that don't need full AST rendering.
 */
export function extractPlainText(text: string): string {
  if (MarkdownParserModule != null && typeof MarkdownParserModule.extractPlainText === "function") {
    return MarkdownParserModule.extractPlainText(text);
  }

  return getFlattenedText(parseMarkdown(text));
}

/**
 * Parse markdown with options and return flattened plain text from native parser.
 */
export function extractPlainTextWithOptions(
  text: string,
  options: ParserOptions,
): string {
  if (MarkdownParserModule != null && typeof MarkdownParserModule.extractPlainTextWithOptions === "function") {
    return MarkdownParserModule.extractPlainTextWithOptions(text, options);
  }

  return getFlattenedText(parseMarkdownWithOptions(text, options));
}

export type { MarkdownParser };

/**
 * Extract text content from a markdown node recursively.
 * Useful for getting plain text from code blocks, headings, etc.
 * @param node - The markdown node to extract text from
 * @returns The concatenated text content
 */
export const getTextContent = (node: MarkdownNode): string => {
  if (node.content) return node.content;
  return node.children?.map(getTextContent).join("") ?? "";
};

/**
 * recursively extracts plain text from the AST, normalizing spacing.
 */
export const getFlattenedText = (node: MarkdownNode): string => {
  if (
    node.type === "text" ||
    node.type === "code_inline" ||
    node.type === "math_inline" ||
    node.type === "html_inline"
  ) {
    return node.content ?? "";
  }

  if (
    node.type === "code_block" ||
    node.type === "math_block" ||
    node.type === "html_block"
  ) {
    return (node.content ?? "").trim() + "\n\n";
  }

  if (node.type === "line_break") return "\n";
  if (node.type === "soft_break") return " ";
  if (node.type === "horizontal_rule") return "---\n\n";

  if (node.type === "image") {
    return node.alt || node.title || "";
  }

  const childrenText = node.children?.map(getFlattenedText).join("") ?? "";

  switch (node.type) {
    case "paragraph":
    case "heading":
    case "blockquote":
      return childrenText.trim() + "\n\n";

    case "list_item":
    case "task_list_item":
      return childrenText.trim() + "\n";

    case "list":
      return childrenText + "\n";

    case "table_row":
      return childrenText + "\n";

    case "table_cell":
      return childrenText + " | ";

    default:
      return childrenText;
  }
};

/**
 * Recursively removes `beg`/`end` source offset fields from an AST.
 * Useful to reduce memory in environments that don't need source mapping.
 */
export function stripSourceOffsets(node: MarkdownNode): MarkdownNode {
  const { beg: _beg, end: _end, children, ...rest } = node;
  return {
    ...rest,
    ...(children ? { children: children.map(stripSourceOffsets) } : {}),
  };
}
