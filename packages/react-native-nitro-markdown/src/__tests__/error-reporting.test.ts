import { stripSourceOffsets, type MarkdownNode } from "../headless";
import { defaultHighlighter } from "../utils/code-highlight";

// ---------------------------------------------------------------------------
// stripSourceOffsets
// ---------------------------------------------------------------------------

describe("stripSourceOffsets", () => {
  it("removes beg and end from a flat node that has them", () => {
    const node: MarkdownNode = {
      type: "text",
      content: "hello",
      beg: 0,
      end: 5,
    };

    const result = stripSourceOffsets(node);

    expect(result).not.toHaveProperty("beg");
    expect(result).not.toHaveProperty("end");
    expect(result.type).toBe("text");
    expect(result.content).toBe("hello");
  });

  it("preserves all non-offset fields on the node", () => {
    const node: MarkdownNode = {
      type: "heading",
      level: 2,
      href: undefined,
      beg: 10,
      end: 30,
      children: [],
    };

    const result = stripSourceOffsets(node);

    expect(result).not.toHaveProperty("beg");
    expect(result).not.toHaveProperty("end");
    expect(result.type).toBe("heading");
    expect(result.level).toBe(2);
  });

  it("recursively removes beg and end from children", () => {
    const node: MarkdownNode = {
      type: "document",
      beg: 0,
      end: 100,
      children: [
        {
          type: "paragraph",
          beg: 0,
          end: 50,
          children: [
            {
              type: "text",
              content: "hello",
              beg: 0,
              end: 5,
            },
          ],
        },
      ],
    };

    const result = stripSourceOffsets(node);

    expect(result).not.toHaveProperty("beg");
    expect(result).not.toHaveProperty("end");

    const paragraph = result.children?.[0];
    expect(paragraph).not.toHaveProperty("beg");
    expect(paragraph).not.toHaveProperty("end");
    expect(paragraph?.type).toBe("paragraph");

    const text = paragraph?.children?.[0];
    expect(text).not.toHaveProperty("beg");
    expect(text).not.toHaveProperty("end");
    expect(text?.content).toBe("hello");
  });

  it("returns an equivalent node when the node has no beg or end", () => {
    const node: MarkdownNode = {
      type: "bold",
      children: [{ type: "text", content: "world" }],
    };

    const result = stripSourceOffsets(node);

    expect(result.type).toBe("bold");
    expect(result.children?.[0]?.content).toBe("world");
    expect(result).not.toHaveProperty("beg");
    expect(result).not.toHaveProperty("end");
  });

  it("handles a node with no children field", () => {
    const node: MarkdownNode = {
      type: "horizontal_rule",
    };

    const result = stripSourceOffsets(node);

    expect(result.type).toBe("horizontal_rule");
    expect(result).not.toHaveProperty("children");
    expect(result).not.toHaveProperty("beg");
    expect(result).not.toHaveProperty("end");
  });
});

// ---------------------------------------------------------------------------
// defaultHighlighter
// ---------------------------------------------------------------------------

describe("defaultHighlighter", () => {
  it("returns a single default token for language 'text'", () => {
    const tokens = defaultHighlighter("text", "anything");
    expect(tokens).toEqual([{ text: "anything", type: "default" }]);
  });

  it("returns a single default token for an empty language string", () => {
    const tokens = defaultHighlighter("", "anything");
    expect(tokens).toEqual([{ text: "anything", type: "default" }]);
  });

  it("identifies 'const' as a keyword in javascript", () => {
    const tokens = defaultHighlighter("javascript", "const x = 1;");
    const constToken = tokens.find((t) => t.text === "const");
    expect(constToken).toBeDefined();
    expect(constToken?.type).toBe("keyword");
  });

  it("identifies a numeric literal as a number token in javascript", () => {
    const tokens = defaultHighlighter("javascript", "const x = 1;");
    const numToken = tokens.find((t) => t.text === "1");
    expect(numToken).toBeDefined();
    expect(numToken?.type).toBe("number");
  });

  it("identifies a line comment as a comment token in javascript", () => {
    const tokens = defaultHighlighter("javascript", "// a comment");
    expect(tokens).toHaveLength(1);
    expect(tokens[0]?.type).toBe("comment");
    expect(tokens[0]?.text).toBe("// a comment");
  });

  it("identifies a string literal as a string token in javascript", () => {
    const tokens = defaultHighlighter("javascript", '"hello"');
    const strToken = tokens.find((t) => t.text === '"hello"');
    expect(strToken).toBeDefined();
    expect(strToken?.type).toBe("string");
  });

  it("identifies 'def' as a keyword in python", () => {
    const tokens = defaultHighlighter("python", "def foo():");
    const defToken = tokens.find((t) => t.text === "def");
    expect(defToken).toBeDefined();
    expect(defToken?.type).toBe("keyword");
  });

  it("assigns type 'type' to a PascalCase identifier in javascript", () => {
    const tokens = defaultHighlighter("javascript", "MyClass");
    const classToken = tokens.find((t) => t.text === "MyClass");
    expect(classToken).toBeDefined();
    expect(classToken?.type).toBe("type");
  });

  it("concatenated token texts equal the original code string", () => {
    const code = "const x = 42; // init";
    const tokens = defaultHighlighter("javascript", code);
    const reconstructed = tokens.map((t) => t.text).join("");
    expect(reconstructed).toBe(code);
  });

  it("concatenated token texts equal the original for multi-line input", () => {
    const code = "const a = 1;\nlet b = 2;";
    const tokens = defaultHighlighter("typescript", code);
    const reconstructed = tokens.map((t) => t.text).join("");
    expect(reconstructed).toBe(code);
  });

  it("returns default token for language 'plain'", () => {
    const tokens = defaultHighlighter("plain", "some text");
    expect(tokens).toEqual([{ text: "some text", type: "default" }]);
  });
});
