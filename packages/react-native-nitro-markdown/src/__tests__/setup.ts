import type { HeadingLevel, MarkdownNode } from "../headless";

Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);

type MockParserOptions = {
  gfm?: boolean;
  math?: boolean;
  html?: boolean;
  sourceOffsets?: boolean;
};

function stripOffsets(node: MarkdownNode): MarkdownNode {
  delete node.beg;
  delete node.end;
  node.children?.forEach(stripOffsets);
  return node;
}

function spanned(
  node: MarkdownNode,
  beg: number,
  end: number,
): MarkdownNode {
  node.beg = beg;
  node.end = end;
  return node;
}

type MockLine = {
  content: string;
  hasLineEnding: boolean;
  start: number;
  end: number;
  next: number;
};

function splitMockLines(text: string): MockLine[] {
  const lines: MockLine[] = [];
  let start = 0;

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character !== "\r" && character !== "\n") continue;

    const end = index;
    if (character === "\r" && text[index + 1] === "\n") index++;
    lines.push({
      content: text.slice(start, end),
      hasLineEnding: true,
      start,
      end,
      next: index + 1,
    });
    start = index + 1;
  }

  if (start < text.length) {
    lines.push({
      content: text.slice(start),
      hasLineEnding: false,
      start,
      end: text.length,
      next: text.length,
    });
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
  return JSON.stringify(includeOffsets ? ast : stripOffsets(ast));
}

function createMockAst(text: string, mathEnabled: boolean): MarkdownNode {
  const root = spanned({ type: "document", children: [] }, 0, text.length);
  if (text.length === 0) return root;

  const lines = splitMockLines(text);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!.content;
    const trimmed = line.trim();

    if (trimmed === "") {
      i++;
      continue;
    }

    if (mathEnabled && lines[i]!.hasLineEnding && isStandaloneMathFenceLine(line)) {
      const openLine = lines[i]!;
      const contentLines: MockLine[] = [];
      i++;
      while (i < lines.length && !isStandaloneMathFenceLine(lines[i]!.content)) {
        contentLines.push(lines[i]!);
        i++;
      }
      const closeLine = i < lines.length ? lines[i]! : undefined;
      if (closeLine) i++;

      const blockEnd = closeLine ? closeLine.end : text.length;
      const mathBlock = spanned({ type: "math_block" }, openLine.start, blockEnd);
      if (contentLines.length > 0) {
        mathBlock.children = [
          spanned(
            {
              type: "text",
              content: `${contentLines.map((entry) => entry.content).join("\n")}\n`,
            },
            contentLines[0]!.start,
            closeLine ? closeLine.start : text.length,
          ),
        ];
      }
      root.children!.push(mathBlock);
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const lineRecord = lines[i]!;
      const leading = line.length - line.trimStart().length;
      const textOffset =
        lineRecord.start +
        line.indexOf(headingMatch[2]!, leading + headingMatch[1]!.length);
      root.children!.push(
        spanned(
          {
            type: "heading",
            level: headingMatch[1]!.length as HeadingLevel,
            children: [
              spanned(
                { type: "text", content: headingMatch[2]! },
                textOffset,
                textOffset + headingMatch[2]!.length,
              ),
            ],
          },
          lineRecord.start,
          lineRecord.end,
        ),
      );
      i++;
      continue;
    }

    if (/^[-*_]{3,}$/.test(trimmed)) {
      root.children!.push(
        spanned({ type: "horizontal_rule" }, lines[i]!.start, lines[i]!.end),
      );
      i++;
      continue;
    }

    const codeBlockMatch = trimmed.match(/^(`{3,}|~{3,})(\w*)$/);
    if (codeBlockMatch) {
      const fence = codeBlockMatch[1]!;
      const isFenceClose = (value: string) => {
        const candidate = value.trim();
        return (
          candidate.length >= fence.length &&
          candidate === fence[0]!.repeat(candidate.length)
        );
      };
      const language = codeBlockMatch[2] || undefined;
      const openLine = lines[i]!;
      const codeLines: MockLine[] = [];
      i++;
      while (i < lines.length && !isFenceClose(lines[i]!.content)) {
        codeLines.push(lines[i]!);
        i++;
      }
      const closeLine = i < lines.length ? lines[i]! : undefined;
      i++;
      const textBeg = codeLines[0]?.start ?? closeLine?.start ?? text.length;
      const textEnd = codeLines.at(-1)?.next ?? textBeg;
      root.children!.push(
        spanned(
          {
            type: "code_block",
            ...(language ? { language } : {}),
            children: [
              spanned(
                {
                  type: "text",
                  content: codeLines.map((entry) => `${entry.content}\n`).join(""),
                },
                textBeg,
                textEnd,
              ),
            ],
          },
          openLine.start,
          closeLine ? closeLine.end : text.length,
        ),
      );
      continue;
    }

    if (trimmed.startsWith(">")) {
      const quoteLines: MockLine[] = [];
      while (i < lines.length && lines[i]!.content.trim().startsWith(">")) {
        quoteLines.push(lines[i]!);
        i++;
      }
      const first = quoteLines[0]!;
      const last = quoteLines.at(-1)!;
      const quoteContent = quoteLines
        .map((entry) => entry.content.trim().replace(/^>\s?/, ""))
        .join(" ");
      const textBeg = first.start + first.content.indexOf(">") + 1;
      root.children!.push(
        spanned(
          {
            type: "blockquote",
            children: [
              spanned(
                {
                  type: "paragraph",
                  children: [
                    spanned({ type: "text", content: quoteContent }, textBeg, last.end),
                  ],
                },
                textBeg,
                last.end,
              ),
            ],
          },
          first.start,
          last.end,
        ),
      );
      continue;
    }

    const paragraphLines: MockLine[] = [];
    while (i < lines.length && lines[i]!.content.trim() !== "") {
      paragraphLines.push(lines[i]!);
      i++;
    }
    if (paragraphLines.length > 0) {
      const first = paragraphLines[0]!;
      const last = paragraphLines.at(-1)!;
      const textContent = paragraphLines.map((entry) => entry.content).join(" ");
      root.children!.push(
        spanned(
          {
            type: "paragraph",
            children: [spanned({ type: "text", content: textContent }, first.start, last.end)],
          },
          first.start,
          last.end,
        ),
      );
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
    parse: jest.fn(() => {
      assertActive();
      return mockParser.parse(buffer);
    }),
    parseWithOptions: jest.fn((options: MockParserOptions) => {
      assertActive();
      return mockParser.parseWithOptions(buffer, options);
    }),
    getTextRange: jest.fn((from: number, to: number) => {
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
