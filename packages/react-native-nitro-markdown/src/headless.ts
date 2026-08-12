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
import {
  MAX_PARSE_INPUT_LENGTH,
  MarkdownError,
  inputTooLargeError,
  toMarkdownError,
} from "./errors";

export type { ParserOptions } from "./Markdown.nitro";

export { MarkdownError, MAX_PARSE_INPUT_LENGTH } from "./errors";
export type { MarkdownErrorCode, MarkdownErrorSource } from "./errors";

export type MarkdownNodeType =
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

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
export type TableCellAlign = "left" | "center" | "right";

/**
 * Represents a node in the Markdown AST (Abstract Syntax Tree).
 * Each node has a type and optional properties depending on the node type.
 */
export type MarkdownNode = {
  /** The type of markdown element this node represents. Used to decide how to render the node. */
  type: MarkdownNodeType;
  /** Text content for text, code, and similar nodes. */
  content?: string;
  /** Heading level (1-6) for heading nodes. */
  level?: HeadingLevel;
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
  align?: TableCellAlign;
  /** Source start offset as a JavaScript UTF-16 index in the original markdown text. */
  beg?: number;
  /** Source end offset as a JavaScript UTF-16 index in the original markdown text. */
  end?: number;
  /** Nested child nodes for hierarchical elements like paragraphs, lists, and tables. */
  children?: MarkdownNode[];
};

function reportNativeParserFailure(methodName: string, error?: unknown): void {
  if (__DEV__) {
    console.error(
      `[NitroMarkdown] ${methodName}: native parser failed.`,
      error,
    );
  }
}

function resolveMaxInputLength(options?: ParserOptions): number {
  if (!options?.maxInputLength) return MAX_PARSE_INPUT_LENGTH;
  return Math.min(options.maxInputLength, MAX_PARSE_INPUT_LENGTH);
}

function assertInputWithinBounds(text: string, options?: ParserOptions): void {
  const maxLength = resolveMaxInputLength(options);
  if (text.length > maxLength) {
    throw inputTooLargeError(text.length, maxLength);
  }
}

function parseJsonAst(jsonStr: string): MarkdownNode {
  try {
    return JSON.parse(jsonStr) as MarkdownNode;
  } catch (error) {
    throw new MarkdownError(
      "invalid_json",
      "parse",
      `[NitroMarkdown] native parser returned invalid JSON: ${String(error)}`,
    );
  }
}

let MarkdownParserModule: MarkdownParser | null = null;
try {
  MarkdownParserModule =
    NitroModules.createHybridObject<MarkdownParser>("MarkdownParser");
} catch (e) {
  if (__DEV__) {
    console.error("[NitroMarkdown] Failed to create native MarkdownParser:", e);
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
 * @param options - Parser options (gfm, math, html)
 * @returns The root node of the parsed AST
 */
export function parseMarkdown(
  text: string,
  options: ParserOptions,
): MarkdownNode;
export function parseMarkdown(
  text: string,
  options?: ParserOptions,
): MarkdownNode {
  assertInputWithinBounds(text, options);
  if (options != null) {
    return parseMarkdownWithOptions(text, options);
  }
  if (
    MarkdownParserModule != null &&
    typeof MarkdownParserModule.parse === "function"
  ) {
    try {
      const jsonStr = MarkdownParserModule.parse(text);
      return parseJsonAst(jsonStr);
    } catch (error) {
      reportNativeParserFailure("parseMarkdown", error);
      throw toMarkdownError(error, "parse");
    }
  }

  throw new MarkdownError(
    "native_unavailable",
    "parse",
    "[NitroMarkdown] parseMarkdown: native parser unavailable — check installation.",
  );
}

/**
 * Parse markdown text with custom options.
 * @param text - The markdown text to parse
 * @param options - Parser options (gfm, math, html)
 * @returns The root node of the parsed AST
 */
export function parseMarkdownWithOptions(
  text: string,
  options: ParserOptions,
): MarkdownNode {
  assertInputWithinBounds(text, options);
  if (
    MarkdownParserModule != null &&
    typeof MarkdownParserModule.parseWithOptions === "function"
  ) {
    try {
      const jsonStr = MarkdownParserModule.parseWithOptions(text, options);
      return parseJsonAst(jsonStr);
    } catch (error) {
      reportNativeParserFailure("parseMarkdownWithOptions", error);
      throw toMarkdownError(error, "parse");
    }
  }

  throw new MarkdownError(
    "native_unavailable",
    "parse",
    "[NitroMarkdown] parseMarkdownWithOptions: native parser unavailable — check installation.",
  );
}

/**
 * Extract flattened plain text from the native parser.
 * Native extraction failures throw a typed `MarkdownError`; there is no
 * silent JavaScript fallback. Use `parseMarkdown*` plus `getFlattenedText`
 * explicitly if you want JavaScript-side flattening.
 */
export function extractPlainText(text: string): string {
  assertInputWithinBounds(text);
  if (
    MarkdownParserModule != null &&
    typeof MarkdownParserModule.extractPlainText === "function"
  ) {
    try {
      return MarkdownParserModule.extractPlainText(text);
    } catch (error) {
      reportNativeParserFailure("extractPlainText", error);
      throw toMarkdownError(error, "extract");
    }
  }

  throw new MarkdownError(
    "native_unavailable",
    "extract",
    "[NitroMarkdown] extractPlainText: native parser unavailable — check installation.",
  );
}

/**
 * Extract flattened plain text from the native parser with options.
 * Native extraction failures throw a typed `MarkdownError`; there is no
 * silent JavaScript fallback.
 */
export function extractPlainTextWithOptions(
  text: string,
  options: ParserOptions,
): string {
  assertInputWithinBounds(text, options);
  if (
    MarkdownParserModule != null &&
    typeof MarkdownParserModule.extractPlainTextWithOptions === "function"
  ) {
    try {
      return MarkdownParserModule.extractPlainTextWithOptions(text, options);
    } catch (error) {
      reportNativeParserFailure("extractPlainTextWithOptions", error);
      throw toMarkdownError(error, "extract");
    }
  }

  throw new MarkdownError(
    "native_unavailable",
    "extract",
    "[NitroMarkdown] extractPlainTextWithOptions: native parser unavailable — check installation.",
  );
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
    const blockContent =
      node.content ?? node.children?.map(getFlattenedText).join("") ?? "";
    return blockContent.trim() + "\n\n";
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
 *
 * Prefer `parseMarkdownWithOptions(text, { sourceOffsets: false })` when you can:
 * it skips emitting the offsets natively, avoiding this post-hoc tree walk and
 * the JSON cost of serializing/parsing them in the first place.
 */
export function stripSourceOffsets(node: MarkdownNode): MarkdownNode {
  const { beg: _beg, end: _end, children, ...rest } = node;
  return {
    ...rest,
    ...(children ? { children: children.map(stripSourceOffsets) } : {}),
  };
}
