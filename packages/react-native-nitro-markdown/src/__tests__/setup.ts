import type { MarkdownNode } from "../headless";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

type MockParserOptions = {
  gfm?: boolean;
  math?: boolean;
  html?: boolean;
  sourceOffsets?: boolean;
};

let offsetCursor = 0;
function stampOffsets(node: MarkdownNode): MarkdownNode {
  node.beg = offsetCursor;
  offsetCursor += (node.content?.length ?? 1) + 1;
  node.end = offsetCursor;
  node.children?.forEach(stampOffsets);
  return node;
}

type MockLine = {
  content: string;
  hasLineEnding: boolean;
};

function splitMockLines(text: string): MockLine[] {
  const lines: MockLine[] = [];
  let start = 0;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character !== "\r" && character !== "\n") continue;

    lines.push({ content: text.slice(start, index), hasLineEnding: true });
    if (character === "\r" && text[index + 1] === "\n") index++;
    start = index + 1;
  }

  if (start < text.length) {
    lines.push({ content: text.slice(start), hasLineEnding: false });
  }

  return lines;
}

function isStandaloneMathFenceLine(line: string): boolean {
  return /^ {0,3}\$\$[ \t]*$/.test(line);
}

function serializeMockAst(
  text: string,
  includeOffsets: boolean,
  mathEnabled = true,
): string {
  const ast = createMockAst(text, mathEnabled);
  if (includeOffsets) {
    offsetCursor = 0;
    stampOffsets(ast);
  }
  return JSON.stringify(ast);
}

function createMockAst(text: string, mathEnabled: boolean): MarkdownNode {
  if (text.length === 0) {
    return { type: "document", children: [] };
  }

  const root: MarkdownNode = { type: "document", children: [] };
  const lines = splitMockLines(text);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].content;
    const trimmed = line.trim();

    if (trimmed === "") {
      i++;
      continue;
    }

    if (mathEnabled && lines[i].hasLineEnding && isStandaloneMathFenceLine(line)) {
      const contentLines: string[] = [];
      i++;
      while (i < lines.length && !isStandaloneMathFenceLine(lines[i].content)) {
        contentLines.push(lines[i].content);
        i++;
      }
      if (i < lines.length) i++;

      const mathBlock: MarkdownNode = { type: "math_block" };
      if (contentLines.length > 0) {
        mathBlock.children = [{ type: "text", content: `${contentLines.join("\n")}\n` }];
      }
      root.children!.push(mathBlock);
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      root.children!.push({
        type: "heading",
        level: headingMatch[1].length,
        children: [{ type: "text", content: headingMatch[2] }],
      });
      i++;
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      root.children!.push({ type: "horizontal_rule" });
      i++;
      continue;
    }

    const codeBlockMatch = trimmed.match(/^```(\w*)$/);
    if (codeBlockMatch) {
      const language = codeBlockMatch[1] || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].content.trim().startsWith("```")) {
        codeLines.push(lines[i].content);
        i++;
      }
      i++;
      root.children!.push({
        type: "code_block",
        language,
        children: [{ type: "text", content: codeLines.join("\n") }],
      });
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].content.trim().startsWith(">")) {
        quoteLines.push(lines[i].content.trim().replace(/^>\s?/, ""));
        i++;
      }
      root.children!.push({
        type: "blockquote",
        children: [{ type: "paragraph", children: [{ type: "text", content: quoteLines.join(" ") }] }],
      });
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length && lines[i].content.trim() !== "") {
      paragraphLines.push(lines[i].content);
      i++;
    }
    if (paragraphLines.length > 0) {
      root.children!.push({
        type: "paragraph",
        children: [{ type: "text", content: paragraphLines.join(" ") }],
      });
    }
  }

  return root;
}

const mockParser = {
  parse: jest.fn((text: string) => serializeMockAst(text, true)),
  parseWithOptions: jest.fn((text: string, options: MockParserOptions) =>
    serializeMockAst(text, options.sourceOffsets !== false, options.math !== false),
  ),
  extractPlainText: jest.fn((text: string) => text),
  extractPlainTextWithOptions: jest.fn((text: string, _options: MockParserOptions) => text),
};

function createMockSession() {
  let buffer = "";
  let highlightPosition = 0;
  let isDisposed = false;
  const listeners = new Map<number, (from: number, to: number) => void>();
  let nextListenerId = 0;

  const assertActive = () => {
    if (isDisposed) {
      throw new Error("HybridMarkdownSession is destroyed");
    }
  };

  const notify = (from: number, to: number) => {
    for (const listener of listeners.values()) {
      listener(from, to);
    }
  };

  const assertUtf16Boundary = (index: number) => {
    if (
      index > 0 &&
      index < buffer.length &&
      buffer.charCodeAt(index - 1) >= 0xd800 &&
      buffer.charCodeAt(index - 1) <= 0xdbff &&
      buffer.charCodeAt(index) >= 0xdc00 &&
      buffer.charCodeAt(index) <= 0xdfff
    ) {
      throw new Error(
        `Invalid range: UTF-16 index ${index} splits a surrogate pair`,
      );
    }
  };

  return {
    append: jest.fn((chunk: string) => {
      assertActive();
      const from = buffer.length;
      buffer += chunk;
      notify(from, buffer.length);
      return buffer.length;
    }),
    clear: jest.fn(() => {
      assertActive();
      buffer = "";
      highlightPosition = 0;
      notify(0, 0);
    }),
    dispose: jest.fn(() => {
      isDisposed = true;
      listeners.clear();
      buffer = "";
      highlightPosition = 0;
    }),
    getAllText: jest.fn(() => {
      assertActive();
      return buffer;
    }),
    getLength: jest.fn(() => {
      assertActive();
      return buffer.length;
    }),
    getTextRange: jest.fn((from: number, to: number) => {
      assertActive();
      if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to < 0 || from > to) {
        return "";
      }
      const start = Math.max(0, Math.min(Math.trunc(from), buffer.length));
      const end = Math.max(start, Math.min(Math.trunc(to), buffer.length));
      assertUtf16Boundary(start);
      assertUtf16Boundary(end);
      return buffer.slice(start, end);
    }),
    get highlightPosition() {
      return highlightPosition;
    },
    set highlightPosition(value: number) {
      assertActive();
      highlightPosition = value;
    },
    reset: jest.fn((text: string) => {
      assertActive();
      buffer = text;
      highlightPosition = 0;
      notify(0, buffer.length);
    }),
    replace: jest.fn((from: number, to: number, text: string) => {
      assertActive();
      if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to < 0 || from > to) {
        throw new Error(
          `Invalid range: from=${from} and to=${to} must be finite, from must be >= 0, and to must be >= from`,
        );
      }
      const start = Math.max(0, Math.min(Math.trunc(from), buffer.length));
      const end = Math.max(start, Math.min(Math.trunc(to), buffer.length));
      assertUtf16Boundary(start);
      assertUtf16Boundary(end);
      buffer = `${buffer.slice(0, start)}${text}${buffer.slice(end)}`;
      notify(start, start + text.length);
      return buffer.length;
    }),
    addListener: jest.fn((listener: (from: number, to: number) => void) => {
      assertActive();
      const id = nextListenerId++;
      listeners.set(id, listener);
      return () => {
        listeners.delete(id);
      };
    }),
  };
}

jest.mock("react-native-nitro-modules", () => ({
  NitroModules: {
    createHybridObject: jest.fn((name: string) =>
      name === "MarkdownSession" ? createMockSession() : mockParser,
    ),
  },
}));

jest.mock("react-native", () => ({
  View: "View",
  Text: "Text",
  FlatList: "FlatList",
  ScrollView: "ScrollView",
  PanResponder: {
    create: jest.fn((handlers) => ({ panHandlers: handlers })),
  },
  Image: {
    getSize: jest.fn(),
  },
  Linking: {
    canOpenURL: jest.fn(),
    openURL: jest.fn(),
  },
  StyleSheet: {
    create: (obj: Record<string, unknown>) => obj,
    flatten: (obj: unknown) => obj,
  },
  Platform: {
    OS: "ios",
    select: (obj: Record<string, unknown>) => obj.ios,
  },
}));

export { mockParser };
