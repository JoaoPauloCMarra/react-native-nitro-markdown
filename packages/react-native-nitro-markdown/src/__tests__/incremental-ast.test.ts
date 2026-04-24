import { mockParser } from "./setup";
import type { MarkdownNode } from "../headless";
import { getNextStreamAst, parseMarkdownAst } from "../utils/incremental-ast";
import { getTextContent } from "../headless";

const setTrailingPathEnd = (ast: MarkdownNode, end: number): MarkdownNode => {
  ast.end = end;
  const children = ast.children;
  if (children && children.length > 0) {
    setTrailingPathEnd(children[children.length - 1], end);
  }
  return ast;
};

describe("incremental AST", () => {
  beforeEach(() => jest.clearAllMocks());

  it("forwards parser options for direct AST parsing", () => {
    parseMarkdownAst("| A |\n|---|\n| B |", { gfm: true });

    expect(mockParser.parseWithOptions).toHaveBeenCalledWith("| A |\n|---|\n| B |", {
      gfm: true,
    });
  });

  it("returns the previous AST when text is unchanged", () => {
    const previousText = "Hello";
    const previousAst = parseMarkdownAst(previousText);
    jest.clearAllMocks();

    const nextAst = getNextStreamAst({
      previousAst,
      previousText,
      nextText: previousText,
    });

    expect(nextAst).toBe(previousAst);
    expect(mockParser.parse).not.toHaveBeenCalled();
  });

  it("avoids reparsing for plain text append", () => {
    const previousText = "Hello";
    const previousAst = setTrailingPathEnd(parseMarkdownAst(previousText), previousText.length);
    jest.clearAllMocks();

    const nextAst = getNextStreamAst({
      previousAst,
      previousText,
      nextText: "Hello world",
    });

    expect(mockParser.parse).not.toHaveBeenCalled();
    expect(getTextContent(nextAst)).toContain("Hello world");
  });

  it("forces full parse when append starts after a line boundary", () => {
    const previousText = "> Quote\n\n";
    const previousAst = setTrailingPathEnd(parseMarkdownAst(previousText), previousText.length);
    jest.clearAllMocks();

    getNextStreamAst({
      previousAst,
      previousText,
      nextText: `${previousText}Next paragraph`,
    });

    expect(mockParser.parse).toHaveBeenCalledTimes(1);
  });

  it("forces full parse after carriage-return block boundaries", () => {
    const previousText = "Line\r";
    const previousAst = setTrailingPathEnd(parseMarkdownAst(previousText), previousText.length);
    jest.clearAllMocks();

    getNextStreamAst({
      previousAst,
      previousText,
      nextText: `${previousText}Next`,
    });

    expect(mockParser.parse).toHaveBeenCalledTimes(1);
  });

  it("falls back to full parse when incremental disabled", () => {
    const previousText = "Hello";
    const previousAst = parseMarkdownAst(previousText);
    jest.clearAllMocks();

    getNextStreamAst({
      allowIncremental: false,
      previousAst,
      previousText,
      nextText: "Hello again",
    });

    expect(mockParser.parse).toHaveBeenCalledTimes(1);
  });

  it("falls back to full parse when the trailing text end is stale", () => {
    const previousText = "Hello";
    const previousAst = setTrailingPathEnd(parseMarkdownAst(previousText), previousText.length - 1);
    jest.clearAllMocks();

    getNextStreamAst({
      previousAst,
      previousText,
      nextText: "Hello world",
    });

    expect(mockParser.parse).toHaveBeenCalledTimes(1);
  });

  it("falls back to parse when trailing leaf is not text", () => {
    const previousText = "# Title\n\n---";
    const previousAst = parseMarkdownAst(previousText);
    jest.clearAllMocks();

    getNextStreamAst({
      previousAst,
      previousText,
      nextText: `${previousText}x`,
    });

    expect(mockParser.parse).toHaveBeenCalledTimes(1);
  });

  it("appends inside open fenced code blocks without reparsing", () => {
    const previousText = "Intro\n\n```ts\nconst a = 1;\n";
    const previousAst = setTrailingPathEnd(parseMarkdownAst(previousText), previousText.length);
    const nextText = `${previousText}const b = 2;\n`;
    jest.clearAllMocks();

    const nextAst = getNextStreamAst({ previousAst, previousText, nextText });

    expect(mockParser.parse).not.toHaveBeenCalled();
    expect(getTextContent(nextAst)).toContain("const b = 2;");
  });

  it("falls back to full parse when fenced code append cannot update the trailing leaf", () => {
    const previousText = "Intro\n\n```ts\nconst a = 1;\n";
    const previousAst = setTrailingPathEnd(parseMarkdownAst(previousText), previousText.length - 1);
    jest.clearAllMocks();

    getNextStreamAst({
      previousAst,
      previousText,
      nextText: `${previousText}const b = 2;\n`,
    });

    expect(mockParser.parse).toHaveBeenCalledTimes(1);
  });

  it("forces full parse when fenced code block may close", () => {
    const previousText = "Intro\n\n```ts\nconst a = 1;\n";
    const previousAst = parseMarkdownAst(previousText);
    const nextText = `${previousText}\`\`\`\n\nAfter`;
    jest.clearAllMocks();

    getNextStreamAst({ previousAst, previousText, nextText });

    expect(mockParser.parse).toHaveBeenCalledTimes(1);
  });

  it("keeps p95 latency within budget for append-only updates", () => {
    let previousText = "Hello";
    let previousAst = setTrailingPathEnd(parseMarkdownAst(previousText), previousText.length);
    jest.clearAllMocks();

    const timings: number[] = [];
    for (let i = 0; i < 200; i++) {
      const nextText = `${previousText}a`;
      const start = performance.now();
      const nextAst = getNextStreamAst({ previousAst, previousText, nextText });
      timings.push(performance.now() - start);
      previousText = nextText;
      previousAst = nextAst;
    }

    const sorted = [...timings].sort((a, b) => a - b);
    const p95 = sorted[Math.floor(sorted.length * 0.95)];
    expect(mockParser.parse).not.toHaveBeenCalled();
    expect(p95).toBeLessThanOrEqual(5);
  });
});
