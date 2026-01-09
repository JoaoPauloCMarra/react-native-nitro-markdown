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
export interface MarkdownNode {
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
  /** Nested child nodes for hierarchical elements like paragraphs, lists, and tables. */
  children?: MarkdownNode[];
}

export const MarkdownParserModule =
  NitroModules.createHybridObject<MarkdownParser>("MarkdownParser");

/**
 * Parse markdown text into an AST.
 * @param text - The markdown text to parse
 * @returns The root node of the parsed AST
 */
export function parseMarkdown(text: string): MarkdownNode {
  const jsonStr = MarkdownParserModule.parse(text);
  return JSON.parse(jsonStr) as MarkdownNode;
}

/**
 * Parse markdown text with custom options.
 * @param text - The markdown text to parse
 * @param options - Parser options (gfm, math)
 * @returns The root node of the parsed AST
 */
export function parseMarkdownWithOptions(
  text: string,
  options: ParserOptions
): MarkdownNode {
  const jsonStr = MarkdownParserModule.parseWithOptions(text, options);
  return JSON.parse(jsonStr) as MarkdownNode;
}

export { MarkdownParser };

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
