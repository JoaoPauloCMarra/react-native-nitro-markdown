import {
  parseMarkdown,
  parseMarkdownWithOptions,
  type MarkdownNode,
} from "../headless";
import type { ParserOptions } from "../Markdown.nitro";

const PLAIN_TEXT_APPEND_PATTERN = /[`*_~[\]#!<>()|$\n\r]/;
const FENCE_LINE_PATTERN = /^ {0,3}(```+|~~~+)/;

const parseAst = (text: string, options?: ParserOptions): MarkdownNode => {
  if (options) {
    return parseMarkdownWithOptions(text, options);
  }
  return parseMarkdown(text);
};

const isInsideFencedCodeBlock = (text: string): boolean => {
  const lines = text.split(/\r?\n/);
  let openFenceChar: "`" | "~" | null = null;
  let openFenceLength = 0;

  for (const line of lines) {
    const fenceMatch = line.match(FENCE_LINE_PATTERN);
    if (!fenceMatch) continue;

    const marker = fenceMatch[1];
    const markerChar = marker[0] as "`" | "~";
    const markerLength = marker.length;

    if (!openFenceChar) {
      openFenceChar = markerChar;
      openFenceLength = markerLength;
      continue;
    }

    if (markerChar === openFenceChar && markerLength >= openFenceLength) {
      openFenceChar = null;
      openFenceLength = 0;
    }
  }

  return openFenceChar !== null;
};

const containsFenceLine = (text: string): boolean => {
  return text.split(/\r?\n/).some((line) => FENCE_LINE_PATTERN.test(line));
};

const getTrailingLine = (text: string): string => {
  const lastLineBreak = Math.max(
    text.lastIndexOf("\n"),
    text.lastIndexOf("\r"),
  );
  if (lastLineBreak === -1) return text;
  return text.slice(lastLineBreak + 1);
};

const getLeadingLine = (text: string): string => {
  const newlineIndex = text.indexOf("\n");
  const carriageReturnIndex = text.indexOf("\r");

  const hasNewline = newlineIndex !== -1;
  const hasCarriageReturn = carriageReturnIndex !== -1;

  if (!hasNewline && !hasCarriageReturn) return text;
  if (!hasNewline) return text.slice(0, carriageReturnIndex);
  if (!hasCarriageReturn) return text.slice(0, newlineIndex);

  return text.slice(0, Math.min(newlineIndex, carriageReturnIndex));
};

const hasSplitFenceBoundary = (
  previousText: string,
  appendedChunk: string,
): boolean => {
  if (appendedChunk.length === 0) return false;

  const candidateLine = `${getTrailingLine(previousText)}${getLeadingLine(
    appendedChunk,
  )}`;
  if (candidateLine.length === 0) return false;

  return FENCE_LINE_PATTERN.test(candidateLine);
};

const findTrailingLeafPath = (
  node: MarkdownNode,
  path: number[] = [],
): number[] => {
  const children = node.children;
  if (!children || children.length === 0) {
    return path;
  }

  const lastIndex = children.length - 1;
  return findTrailingLeafPath(children[lastIndex], [...path, lastIndex]);
};

const getNodeAtPath = (
  node: MarkdownNode,
  path: readonly number[],
): MarkdownNode | null => {
  let current: MarkdownNode = node;
  for (const index of path) {
    const child = current.children?.[index];
    if (!child) return null;
    current = child;
  }
  return current;
};

const appendPlainTextToAst = (
  ast: MarkdownNode,
  appendedChunk: string,
  previousTextLength: number,
): MarkdownNode | null => {
  if (appendedChunk.length === 0) return ast;
  const path = findTrailingLeafPath(ast);
  const leaf = getNodeAtPath(ast, path);
  if (leaf?.type !== "text") return null;
  if (typeof leaf.end !== "number" || leaf.end !== previousTextLength) {
    return null;
  }

  const delta = appendedChunk.length;
  const update = (node: MarkdownNode, depth: number): MarkdownNode => {
    if (depth === path.length) {
      return {
        ...node,
        content: (node.content ?? "") + appendedChunk,
        end: typeof node.end === "number" ? node.end + delta : node.end,
      };
    }

    const childIndex = path[depth];
    const children = node.children?.map((child, index) =>
      index === childIndex ? update(child, depth + 1) : child,
    );

    return {
      ...node,
      end: typeof node.end === "number" ? node.end + delta : node.end,
      children,
    };
  };

  return update(ast, 0);
};

const endsAtBlockBoundary = (text: string): boolean => {
  return text.endsWith("\n") || text.endsWith("\r");
};

export type IncrementalAstInput = {
  allowIncremental?: boolean;
  nextText: string;
  options?: ParserOptions;
  previousAst: MarkdownNode;
  previousText: string;
};

export const getNextStreamAst = ({
  allowIncremental = true,
  nextText,
  options,
  previousAst,
  previousText,
}: IncrementalAstInput): MarkdownNode => {
  if (!allowIncremental || !nextText.startsWith(previousText)) {
    return parseAst(nextText, options);
  }

  const appendedChunk = nextText.slice(previousText.length);
  if (appendedChunk.length === 0) {
    return previousAst;
  }

  const insideFencedCodeBlock = isInsideFencedCodeBlock(previousText);
  const hasFenceBoundary =
    containsFenceLine(appendedChunk) ||
    hasSplitFenceBoundary(previousText, appendedChunk);

  if (insideFencedCodeBlock && !hasFenceBoundary) {
    const fencedTextAppendAst = appendPlainTextToAst(
      previousAst,
      appendedChunk,
      previousText.length,
    );
    if (fencedTextAppendAst) {
      return fencedTextAppendAst;
    }
  }

  if (!PLAIN_TEXT_APPEND_PATTERN.test(appendedChunk)) {
    if (endsAtBlockBoundary(previousText)) {
      return parseAst(nextText, options);
    }

    const textAppendedAst = appendPlainTextToAst(
      previousAst,
      appendedChunk,
      previousText.length,
    );
    if (textAppendedAst) {
      return textAppendedAst;
    }
  }

  if (insideFencedCodeBlock) {
    return parseAst(nextText, options);
  }

  // Correctness-first fallback: full reparse for all non-trivial appends.
  // Incremental append is only used for plain text chunks at the true trailing leaf.
  return parseAst(nextText, options);
};

export const parseMarkdownAst = (
  text: string,
  options?: ParserOptions,
): MarkdownNode => {
  return parseAst(text, options);
};
