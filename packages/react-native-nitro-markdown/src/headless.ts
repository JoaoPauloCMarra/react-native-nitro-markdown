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

export interface MarkdownNode {
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
  content?: string;
  level?: number;
  href?: string;
  title?: string;
  alt?: string;
  language?: string;
  ordered?: boolean;
  start?: number;
  checked?: boolean;
  isHeader?: boolean;
  align?: string;
  children?: MarkdownNode[];
}

export const MarkdownParserModule =
  NitroModules.createHybridObject<MarkdownParser>("MarkdownParser");

export function parseMarkdown(text: string): MarkdownNode {
  const jsonStr = MarkdownParserModule.parse(text);
  return JSON.parse(jsonStr) as MarkdownNode;
}

export function parseMarkdownWithOptions(
  text: string,
  options: ParserOptions
): MarkdownNode {
  const jsonStr = MarkdownParserModule.parseWithOptions(text, options);
  return JSON.parse(jsonStr) as MarkdownNode;
}

export { MarkdownParser };
