import { mockParser } from "./setup";
import { getTextContent, type MarkdownNode } from "../headless";
import { getNextStreamAst, parseMarkdownAst } from "../utils/incremental-ast";

const setTrailingPathEnd = (ast: MarkdownNode, end: number): MarkdownNode => {
  ast.end = end;
  const children = ast.children;
  if (children && children.length > 0) {
    const trailingChild = children[children.length - 1];
    if (trailingChild) {
      setTrailingPathEnd(trailingChild, end);
    }
  }
  return ast;
};

describe("stream incremental AST", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("avoids reparsing for plain text append chunks", () => {
    const previousText = "Hello";
    const previousAst = setTrailingPathEnd(
      parseMarkdownAst(previousText),
      previousText.length,
    );

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
    const previousText = "> Quote line\n\n";
    const previousAst = setTrailingPathEnd(
      parseMarkdownAst(previousText),
      previousText.length,
    );

    jest.clearAllMocks();

    getNextStreamAst({
      previousAst,
      previousText,
      nextText: `${previousText}Next paragraph`,
    });

    expect(mockParser.parse).toHaveBeenCalledTimes(1);
  });

  it("reparses table appends through full parse fallback", () => {
    const previousText = "Intro paragraph.\n\n";
    const previousAst = parseMarkdownAst(previousText);
    const nextText = `${previousText}| H1 | H2 |\n|----|----|\n| C1 | C2 |`;

    jest.clearAllMocks();

    const nextAst = getNextStreamAst({
      previousAst,
      previousText,
      nextText,
    });

    expect(mockParser.parse).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(nextAst)).toContain('"table"');
  });

  it("falls back to full parse when incremental mode is disabled", () => {
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

  it("falls back to parse when trailing leaf is not a text node", () => {
    const previousText = "# Title\n\n---";
    const previousAst = parseMarkdownAst(previousText);

    jest.clearAllMocks();

    const nextAst = getNextStreamAst({
      previousAst,
      previousText,
      nextText: `${previousText}x`,
    });

    expect(mockParser.parse).toHaveBeenCalledTimes(1);
    expect(getTextContent(nextAst)).toContain("Title");
  });

  it("appends inside open fenced code blocks without reparsing each chunk", () => {
    const previousText = "Intro\n\n```ts\nconst a = 1;\n";
    const previousAst = setTrailingPathEnd(
      parseMarkdownAst(previousText),
      previousText.length,
    );
    const nextText = `${previousText}const b = 2;\n`;

    jest.clearAllMocks();

    const nextAst = getNextStreamAst({
      previousAst,
      previousText,
      nextText,
    });

    expect(mockParser.parse).not.toHaveBeenCalled();
    expect(getTextContent(nextAst)).toContain("const b = 2;");
  });

  it("forces full parse when fenced code block boundary may close", () => {
    const previousText = "Intro\n\n```ts\nconst a = 1;\n";
    const previousAst = parseMarkdownAst(previousText);
    const nextText = `${previousText}\`\`\`\n\n| H1 | H2 |\n| --- | --- |\n| A | B |\n`;

    jest.clearAllMocks();

    const nextAst = getNextStreamAst({
      previousAst,
      previousText,
      nextText,
    });

    expect(mockParser.parse).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(nextAst)).toContain('"table"');
  });

  it("forces full parse when fenced closing marker is split across chunks", () => {
    const previousText = "Intro\n\n```ts\nconst a = 1;\n";
    const previousAst = setTrailingPathEnd(
      parseMarkdownAst(previousText),
      previousText.length,
    );
    const midText = `${previousText}\``;

    const midAst = getNextStreamAst({
      previousAst,
      previousText,
      nextText: midText,
    });

    jest.clearAllMocks();

    const nextAst = getNextStreamAst({
      previousAst: midAst,
      previousText: midText,
      nextText: `${midText}\`\`\n\nAfter`,
    });

    expect(mockParser.parse).toHaveBeenCalledTimes(1);
    expect(getTextContent(nextAst)).toContain("After");
  });
});
