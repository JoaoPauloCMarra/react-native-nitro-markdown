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
  invalidInputLengthError,
  inputTooLargeError,
  toMarkdownError,
  utf8ByteLength,
} from "./errors";
import {
  cloneMarkdownNode,
  assertAcyclicMarkdownNode,
  freezeMarkdownNode,
} from "./utils/freeze-ast";

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
 * Parsed nodes are mutable by default for compatibility. Pass
 * `freezeAst: true` when defensive immutability is required.
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
  const value = options?.maxInputLength;
  if (value === undefined || value === 0) return MAX_PARSE_INPUT_LENGTH;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw invalidInputLengthError(value);
  }
  return Math.min(value, MAX_PARSE_INPUT_LENGTH);
}

function assertInputWithinBounds(text: string, options?: ParserOptions): void {
  const maxBytes = resolveMaxInputLength(options);
  const actualBytes = utf8ByteLength(text);
  if (actualBytes > maxBytes) {
    throw inputTooLargeError(actualBytes, maxBytes);
  }
}

function parseJsonAst(jsonStr: string, freezeAst = false): MarkdownNode {
  try {
    const ast = JSON.parse(jsonStr) as MarkdownNode;
    assertAcyclicMarkdownNode(ast);
    return freezeAst ? freezeMarkdownNode(ast) : ast;
  } catch (error) {
    if (error instanceof MarkdownError) throw error;
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
      return parseJsonAst(jsonStr, false);
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
      return parseJsonAst(jsonStr, options.freezeAst === true);
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

/** Extract flattened plain text from the native parser or parsed AST. */
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
    }
  }

  return getFlattenedText(parseMarkdown(text));
}

/** Extract flattened plain text from the native parser or parsed AST. */
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
    }
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
  const safeNode = cloneMarkdownNode(node);
  const pending: MarkdownNode[] = [safeNode];
  let text = "";
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current.content) {
      text += current.content;
      if (text.length > 64 * 1024 * 1024) {
        throw new MarkdownError(
          "invalid_ast",
          "render",
          "[NitroMarkdown] AST text content exceeds the maximum size",
        );
      }
      continue;
    }
    const children = current.children;
    if (!children) continue;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push(children[index]!);
    }
  }
  return text;
};

/**
 * recursively extracts plain text from the AST, normalizing spacing.
 */
export const getFlattenedText = (node: MarkdownNode): string => {
  const safeNode = cloneMarkdownNode(node);
  const frames: {
    node: MarkdownNode;
    index: number;
    parts: string[];
  }[] = [{ node: safeNode, index: 0, parts: [] }];
  let result = "";

  const appendResult = (value: string): void => {
    result += value;
    if (result.length > 64 * 1024 * 1024) {
      throw new MarkdownError(
        "invalid_ast",
        "render",
        "[NitroMarkdown] Flattened AST text exceeds the maximum size",
      );
    }
  };

  while (frames.length > 0) {
    const frame = frames[frames.length - 1]!;
    const children = frame.node.children;
    if (children && frame.index < children.length) {
      const child = children[frame.index]!;
      frame.index += 1;
      frames.push({ node: child, index: 0, parts: [] });
      continue;
    }

    const current = frame.node;
    let value: string;
    if (
      current.type === "text" ||
      current.type === "code_inline" ||
      current.type === "math_inline" ||
      current.type === "html_inline"
    ) {
      value = current.content ?? "";
    } else if (
      current.type === "code_block" ||
      current.type === "math_block" ||
      current.type === "html_block"
    ) {
      const blockContent = current.content ?? frame.parts.join("");
      value = `${blockContent.trim()}\n\n`;
    } else if (current.type === "line_break") {
      value = "\n";
    } else if (current.type === "soft_break") {
      value = " ";
    } else if (current.type === "horizontal_rule") {
      value = "---\n\n";
    } else if (current.type === "image") {
      value = current.alt || current.title || "";
    } else {
      const childrenText = frame.parts.join("");
      switch (current.type) {
        case "paragraph":
        case "heading":
        case "blockquote":
          value = `${childrenText.trim()}\n\n`;
          break;
        case "list_item":
        case "task_list_item":
          value = `${childrenText.trim()}\n`;
          break;
        case "list":
        case "table_row":
          value = `${childrenText}\n`;
          break;
        case "table_cell":
          value = `${childrenText} | `;
          break;
        default:
          value = childrenText;
      }
    }

    frames.pop();
    const parent = frames[frames.length - 1];
    if (parent) parent.parts.push(value);
    else appendResult(value);
  }

  return result;
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
  const cloned = cloneMarkdownNode(node);
  const pending: MarkdownNode[] = [cloned];
  while (pending.length > 0) {
    const current = pending.pop()! as MarkdownNode & {
      beg?: number;
      end?: number;
    };
    delete current.beg;
    delete current.end;
    if (current.children) {
      for (const child of current.children) pending.push(child);
    }
  }
  return cloned;
}
