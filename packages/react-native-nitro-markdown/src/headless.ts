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
  /** The type of markdown element this node represents */
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
  /** Text content for text, code, and similar nodes */
  content?: string;
  /** Heading level (1-6) for heading nodes */
  level?: number;
  /** URL for link and image nodes */
  href?: string;
  /** Title attribute for link and image nodes */
  title?: string;
  /** Alt text for image nodes */
  alt?: string;
  /** Programming language for code blocks */
  language?: string;
  /** Whether list is ordered (numbered) */
  ordered?: boolean;
  /** Start number for ordered lists */
  start?: number;
  /** Whether task list item is checked */
  checked?: boolean;
  /** Whether table cell is a header cell */
  isHeader?: boolean;
  /** Text alignment for table cells */
  align?: string;
  /** Child nodes */
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
