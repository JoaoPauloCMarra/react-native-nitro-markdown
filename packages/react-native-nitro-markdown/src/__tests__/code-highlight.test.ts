import { defaultHighlighter, type HighlightedToken } from "../utils/code-highlight";

const joinTokenTexts = (tokens: HighlightedToken[]): string =>
  tokens.map((t) => t.text).join("");

describe("defaultHighlighter", () => {
  it("returns single default token for text language", () => {
    const tokens = defaultHighlighter("text", "hello world");
    expect(tokens).toEqual([{ text: "hello world", type: "default" }]);
  });

  it("returns single default token for plain language", () => {
    const tokens = defaultHighlighter("plain", "hello");
    expect(tokens).toEqual([{ text: "hello", type: "default" }]);
  });

  it("returns single default token for empty language", () => {
    const tokens = defaultHighlighter("", "hello");
    expect(tokens).toEqual([{ text: "hello", type: "default" }]);
  });

  it("returns empty array for empty code", () => {
    const tokens = defaultHighlighter("javascript", "");
    expect(tokens).toHaveLength(0);
  });

  it("identifies keywords in JavaScript", () => {
    const tokens = defaultHighlighter("javascript", "const x = 1");
    expect(tokens.find((t) => t.text === "const")?.type).toBe("keyword");
  });

  it("identifies number literals", () => {
    const tokens = defaultHighlighter("javascript", "42");
    expect(tokens.find((t) => t.text === "42")?.type).toBe("number");
  });

  it("identifies string literals", () => {
    const tokens = defaultHighlighter("javascript", '"hello"');
    expect(tokens.find((t) => t.text === '"hello"')?.type).toBe("string");
  });

  it("identifies // comments in JavaScript", () => {
    const tokens = defaultHighlighter("javascript", "// comment");
    expect(tokens.find((t) => t.type === "comment")).toBeDefined();
  });

  it("identifies PascalCase as type", () => {
    const tokens = defaultHighlighter("javascript", "MyComponent");
    expect(tokens.find((t) => t.text === "MyComponent")?.type).toBe("type");
  });

  it("identifies operators", () => {
    const tokens = defaultHighlighter("javascript", "a + b");
    expect(tokens.find((t) => t.text === "+")?.type).toBe("operator");
  });

  it("identifies punctuation", () => {
    const tokens = defaultHighlighter("javascript", "fn()");
    expect(tokens.find((t) => t.text === "(")?.type).toBe("punctuation");
  });

  it("identifies Python keywords", () => {
    const tokens = defaultHighlighter("python", "def foo():");
    expect(tokens.find((t) => t.text === "def")?.type).toBe("keyword");
  });

  it("identifies shell keywords", () => {
    const tokens = defaultHighlighter("bash", "if then fi");
    expect(tokens.filter((t) => t.type === "keyword").map((t) => t.text)).toEqual(
      expect.arrayContaining(["if", "then", "fi"]),
    );
  });

  describe("# comment detection by language", () => {
    it("does NOT highlight # as comment in JavaScript", () => {
      const tokens = defaultHighlighter("javascript", "# not a comment");
      expect(tokens.find((t) => t.type === "comment")).toBeUndefined();
    });

    it("highlights # comment in shell", () => {
      const tokens = defaultHighlighter("bash", "# comment");
      expect(tokens[0].type).toBe("comment");
    });

    it("highlights # comment in Python", () => {
      const tokens = defaultHighlighter("python", "# comment");
      expect(tokens[0].type).toBe("comment");
    });
  });

  it("concatenated token texts equal the original code", () => {
    const code = 'const x = 42; // hello\nreturn "world";';
    const tokens = defaultHighlighter("javascript", code);
    expect(joinTokenTexts(tokens)).toBe(code);
  });

  it("inserts newline tokens between lines", () => {
    const code = "a\nb";
    const tokens = defaultHighlighter("javascript", code);
    expect(tokens.some((t) => t.text === "\n")).toBe(true);
  });
});
