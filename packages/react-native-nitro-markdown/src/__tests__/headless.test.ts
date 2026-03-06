import "./setup";
import {
  getFlattenedText,
  getTextContent,
  stripSourceOffsets,
  type MarkdownNode,
} from "../headless";

describe("getFlattenedText", () => {
  it("extracts text from a simple paragraph", () => {
    const node: MarkdownNode = {
      type: "paragraph",
      children: [{ type: "text", content: "Hello world" }],
    };
    expect(getFlattenedText(node)).toBe("Hello world\n\n");
  });

  it("extracts text from a heading", () => {
    const node: MarkdownNode = {
      type: "heading",
      level: 1,
      children: [{ type: "text", content: "Title" }],
    };
    expect(getFlattenedText(node)).toBe("Title\n\n");
  });

  it("extracts text from a code block", () => {
    const node: MarkdownNode = {
      type: "code_block",
      language: "javascript",
      content: "const x = 1;\n",
    };
    expect(getFlattenedText(node)).toBe("const x = 1;\n\n");
  });

  it("extracts text from code_inline", () => {
    const node: MarkdownNode = {
      type: "code_inline",
      content: "foo()",
    };
    expect(getFlattenedText(node)).toBe("foo()");
  });

  it("extracts text from math_inline", () => {
    const node: MarkdownNode = {
      type: "math_inline",
      content: "E=mc^2",
    };
    expect(getFlattenedText(node)).toBe("E=mc^2");
  });

  it("extracts text from html_inline", () => {
    const node: MarkdownNode = {
      type: "html_inline",
      content: "<br>",
    };
    expect(getFlattenedText(node)).toBe("<br>");
  });

  it("extracts text from math_block", () => {
    const node: MarkdownNode = {
      type: "math_block",
      content: "\\sum_{i=1}^n",
    };
    expect(getFlattenedText(node)).toBe("\\sum_{i=1}^n\n\n");
  });

  it("extracts text from html_block", () => {
    const node: MarkdownNode = {
      type: "html_block",
      content: "<div>test</div>  ",
    };
    expect(getFlattenedText(node)).toBe("<div>test</div>\n\n");
  });

  it("returns newline for line_break", () => {
    const node: MarkdownNode = { type: "line_break" };
    expect(getFlattenedText(node)).toBe("\n");
  });

  it("returns space for soft_break", () => {
    const node: MarkdownNode = { type: "soft_break" };
    expect(getFlattenedText(node)).toBe(" ");
  });

  it("returns --- for horizontal_rule", () => {
    const node: MarkdownNode = { type: "horizontal_rule" };
    expect(getFlattenedText(node)).toBe("---\n\n");
  });

  it("extracts alt text from image", () => {
    const node: MarkdownNode = {
      type: "image",
      alt: "A photo",
      href: "https://example.com/img.png",
    };
    expect(getFlattenedText(node)).toBe("A photo");
  });

  it("falls back to title for image with no alt", () => {
    const node: MarkdownNode = {
      type: "image",
      title: "Photo title",
      href: "https://example.com/img.png",
    };
    expect(getFlattenedText(node)).toBe("Photo title");
  });

  it("returns empty string for image with no alt or title", () => {
    const node: MarkdownNode = {
      type: "image",
      href: "https://example.com/img.png",
    };
    expect(getFlattenedText(node)).toBe("");
  });

  it("extracts text from a list", () => {
    const node: MarkdownNode = {
      type: "list",
      ordered: false,
      children: [
        {
          type: "list_item",
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", content: "Item 1" }],
            },
          ],
        },
        {
          type: "list_item",
          children: [
            {
              type: "paragraph",
              children: [{ type: "text", content: "Item 2" }],
            },
          ],
        },
      ],
    };
    const result = getFlattenedText(node);
    expect(result).toContain("Item 1");
    expect(result).toContain("Item 2");
  });

  it("extracts text from task_list_item", () => {
    const node: MarkdownNode = {
      type: "task_list_item",
      checked: true,
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", content: "Done task" }],
        },
      ],
    };
    const result = getFlattenedText(node);
    expect(result).toContain("Done task");
  });

  it("extracts text from nested document structure", () => {
    const node: MarkdownNode = {
      type: "document",
      children: [
        {
          type: "heading",
          level: 1,
          children: [{ type: "text", content: "Title" }],
        },
        {
          type: "paragraph",
          children: [
            { type: "text", content: "Hello " },
            {
              type: "bold",
              children: [{ type: "text", content: "world" }],
            },
          ],
        },
      ],
    };
    const result = getFlattenedText(node);
    expect(result).toContain("Title");
    expect(result).toContain("Hello ");
    expect(result).toContain("world");
  });

  it("extracts text from a blockquote", () => {
    const node: MarkdownNode = {
      type: "blockquote",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", content: "Quoted text" }],
        },
      ],
    };
    // blockquote case: childrenText = paragraph("Quoted text\n\n") => trimmed + "\n\n"
    // paragraph childrenText = "Quoted text" => trimmed + "\n\n" = "Quoted text\n\n"
    // blockquote: "Quoted text\n\n".trim() + "\n\n" = "Quoted text\n\n"
    expect(getFlattenedText(node)).toBe("Quoted text\n\n");
  });

  it("handles table structures", () => {
    const node: MarkdownNode = {
      type: "table",
      children: [
        {
          type: "table_head",
          children: [
            {
              type: "table_row",
              children: [
                {
                  type: "table_cell",
                  isHeader: true,
                  children: [{ type: "text", content: "Header" }],
                },
              ],
            },
          ],
        },
      ],
    };
    const result = getFlattenedText(node);
    expect(result).toContain("Header");
    expect(result).toContain("|");
  });

  it("returns empty string for text node with no content", () => {
    const node: MarkdownNode = { type: "text" };
    expect(getFlattenedText(node)).toBe("");
  });

  it("returns empty string for code_block with no content", () => {
    const node: MarkdownNode = { type: "code_block" };
    expect(getFlattenedText(node)).toBe("\n\n");
  });

  it("handles document with no children", () => {
    const node: MarkdownNode = { type: "document" };
    expect(getFlattenedText(node)).toBe("");
  });

  it("handles document with empty children array", () => {
    const node: MarkdownNode = { type: "document", children: [] };
    expect(getFlattenedText(node)).toBe("");
  });
});

describe("getTextContent", () => {
  it("returns content when present", () => {
    const node: MarkdownNode = { type: "text", content: "hello" };
    expect(getTextContent(node)).toBe("hello");
  });

  it("concatenates children text recursively", () => {
    const node: MarkdownNode = {
      type: "paragraph",
      children: [
        { type: "text", content: "Hello " },
        { type: "bold", children: [{ type: "text", content: "world" }] },
      ],
    };
    expect(getTextContent(node)).toBe("Hello world");
  });

  it("returns empty string for node with no content or children", () => {
    const node: MarkdownNode = { type: "paragraph" };
    expect(getTextContent(node)).toBe("");
  });
});

describe("stripSourceOffsets", () => {
  it("removes beg and end from a single node", () => {
    const node: MarkdownNode = {
      type: "text",
      content: "hello",
      beg: 0,
      end: 5,
    };
    const result = stripSourceOffsets(node);
    expect(result.beg).toBeUndefined();
    expect(result.end).toBeUndefined();
    expect(result.content).toBe("hello");
    expect(result.type).toBe("text");
  });

  it("recursively removes offsets from children", () => {
    const node: MarkdownNode = {
      type: "document",
      beg: 0,
      end: 20,
      children: [
        {
          type: "paragraph",
          beg: 0,
          end: 10,
          children: [{ type: "text", content: "hi", beg: 0, end: 2 }],
        },
      ],
    };
    const result = stripSourceOffsets(node);
    expect(result.beg).toBeUndefined();
    expect(result.end).toBeUndefined();
    expect(result.children![0].beg).toBeUndefined();
    expect(result.children![0].end).toBeUndefined();
    expect(result.children![0].children![0].beg).toBeUndefined();
    expect(result.children![0].children![0].end).toBeUndefined();
  });

  it("does not add children key when original has none", () => {
    const node: MarkdownNode = { type: "text", content: "x" };
    const result = stripSourceOffsets(node);
    expect(Object.keys(result)).not.toContain("children");
  });
});
