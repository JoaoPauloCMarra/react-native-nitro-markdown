import { defaultHighlighter, type HighlightedToken } from "../utils/code-highlight";

describe("defaultHighlighter", () => {
  describe("comment detection by language", () => {
    it("does NOT highlight # as comment in JavaScript", () => {
      const tokens = defaultHighlighter("javascript", "class Foo { #bar = 1; }");
      const commentTokens = tokens.filter((t) => t.type === "comment");
      expect(commentTokens).toHaveLength(0);
    });

    it("does NOT highlight # as comment in TypeScript", () => {
      const tokens = defaultHighlighter("typescript", "this.#privateField");
      const commentTokens = tokens.filter((t) => t.type === "comment");
      expect(commentTokens).toHaveLength(0);
    });

    it("highlights # comment in shell", () => {
      const tokens = defaultHighlighter("bash", "# this is a comment");
      const commentTokens = tokens.filter((t) => t.type === "comment");
      expect(commentTokens).toHaveLength(1);
      expect(commentTokens[0].text).toContain("# this is a comment");
    });

    it("highlights # comment in Python", () => {
      const tokens = defaultHighlighter("python", "# python comment");
      const commentTokens = tokens.filter((t) => t.type === "comment");
      expect(commentTokens).toHaveLength(1);
      expect(commentTokens[0].text).toContain("# python comment");
    });

    it("highlights # comment in sh", () => {
      const tokens = defaultHighlighter("sh", "echo hello # inline comment");
      const commentTokens = tokens.filter((t) => t.type === "comment");
      expect(commentTokens).toHaveLength(1);
    });

    it("highlights # comment in zsh", () => {
      const tokens = defaultHighlighter("zsh", "# zsh comment");
      const commentTokens = tokens.filter((t) => t.type === "comment");
      expect(commentTokens).toHaveLength(1);
    });

    it("highlights # comment in py alias", () => {
      const tokens = defaultHighlighter("py", "# py comment");
      const commentTokens = tokens.filter((t) => t.type === "comment");
      expect(commentTokens).toHaveLength(1);
    });
  });

  describe("// comments", () => {
    it("highlights // comments in JavaScript", () => {
      const tokens = defaultHighlighter("javascript", "// js comment");
      const commentTokens = tokens.filter((t) => t.type === "comment");
      expect(commentTokens).toHaveLength(1);
      expect(commentTokens[0].text).toContain("// js comment");
    });

    it("highlights // comments in TypeScript", () => {
      const tokens = defaultHighlighter("typescript", "const x = 1; // inline");
      const commentTokens = tokens.filter((t) => t.type === "comment");
      expect(commentTokens).toHaveLength(1);
      expect(commentTokens[0].text).toContain("// inline");
    });
  });

  describe("empty and plain text", () => {
    it("returns empty array for empty code string", () => {
      const tokens = defaultHighlighter("javascript", "");
      expect(tokens).toHaveLength(0);
    });

    it("returns single default token for text language", () => {
      const tokens = defaultHighlighter("text", "hello world");
      expect(tokens).toEqual([{ text: "hello world", type: "default" }]);
    });

    it("returns single default token for plain language", () => {
      const tokens = defaultHighlighter("plain", "some text");
      expect(tokens).toEqual([{ text: "some text", type: "default" }]);
    });

    it("returns single default token for empty language", () => {
      const tokens = defaultHighlighter("", "const x = 1");
      expect(tokens).toEqual([{ text: "const x = 1", type: "default" }]);
    });
  });

  describe("multi-line with mixed tokens", () => {
    it("tokenizes multi-line JS with keywords, strings, numbers, and comments", () => {
      const code = [
        "const x = 42;",
        '// a comment',
        'const y = "hello";',
      ].join("\n");

      const tokens = defaultHighlighter("javascript", code);

      const keywords = tokens.filter((t) => t.type === "keyword");
      const numbers = tokens.filter((t) => t.type === "number");
      const strings = tokens.filter((t) => t.type === "string");
      const comments = tokens.filter((t) => t.type === "comment");
      const newlines = tokens.filter((t) => t.text === "\n");

      expect(keywords.length).toBeGreaterThanOrEqual(2);
      expect(numbers).toHaveLength(1);
      expect(numbers[0].text).toBe("42");
      expect(strings).toHaveLength(1);
      expect(strings[0].text).toBe('"hello"');
      expect(comments).toHaveLength(1);
      expect(newlines).toHaveLength(2);
    });

    it("inserts newline tokens between lines", () => {
      const tokens = defaultHighlighter("javascript", "a\nb\nc");
      const newlines = tokens.filter((t) => t.text === "\n");
      expect(newlines).toHaveLength(2);
    });
  });

  describe("token types", () => {
    it("identifies keywords correctly", () => {
      const tokens = defaultHighlighter("javascript", "const let var function return");
      const keywords = tokens.filter((t) => t.type === "keyword");
      expect(keywords.map((t) => t.text)).toEqual(
        expect.arrayContaining(["const", "let", "var", "function", "return"]),
      );
    });

    it("identifies type-like identifiers (PascalCase)", () => {
      const tokens = defaultHighlighter("javascript", "MyClass");
      const types = tokens.filter((t) => t.type === "type");
      expect(types).toHaveLength(1);
      expect(types[0].text).toBe("MyClass");
    });

    it("identifies operators", () => {
      const tokens = defaultHighlighter("javascript", "x + y === z");
      const operators = tokens.filter((t) => t.type === "operator");
      expect(operators.length).toBeGreaterThanOrEqual(2);
    });

    it("identifies punctuation", () => {
      const tokens = defaultHighlighter("javascript", "fn(a, b)");
      const punctuation = tokens.filter((t) => t.type === "punctuation");
      expect(punctuation.length).toBeGreaterThanOrEqual(3);
    });

    it("identifies Python keywords", () => {
      const tokens = defaultHighlighter("python", "def foo():\n  return None");
      const keywords = tokens.filter((t) => t.type === "keyword");
      expect(keywords.map((t) => t.text)).toEqual(
        expect.arrayContaining(["def", "return", "None"]),
      );
    });

    it("identifies shell keywords", () => {
      const tokens = defaultHighlighter("bash", "if [ -d /tmp ]; then echo ok; fi");
      const keywords = tokens.filter((t) => t.type === "keyword");
      expect(keywords.map((t) => t.text)).toEqual(
        expect.arrayContaining(["if", "then", "echo", "fi"]),
      );
    });
  });
});
