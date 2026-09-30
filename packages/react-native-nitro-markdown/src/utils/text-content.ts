import { MarkdownError } from "../errors";
import type { MarkdownNode } from "../headless";

const MAX_TEXT_READ_NODES = 2_000_000;

const textReadBudgetError = (): MarkdownError =>
  new MarkdownError(
    "invalid_ast",
    "render",
    "[NitroMarkdown] AST node count exceeds the maximum size",
  );

export const readTextContent = (node: MarkdownNode): string => {
  const pending: MarkdownNode[] = [node];
  let visited = 0;
  let text = "";
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (++visited > MAX_TEXT_READ_NODES) throw textReadBudgetError();
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

export const readFlattenedText = (node: MarkdownNode): string => {
  let visited = 0;
  const frames: {
    node: MarkdownNode;
    index: number;
    parts: string[];
  }[] = [{ node, index: 0, parts: [] }];
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
      if (++visited > MAX_TEXT_READ_NODES) throw textReadBudgetError();
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
