import { parseMarkdown } from "../index";
import type { MarkdownNode, ParserOptions } from "../index";

describe("type exports", () => {
  it("exports MarkdownNode type", () => {
    const node: MarkdownNode = {
      type: "document",
      children: [],
    };
    expect(node.type).toBe("document");
  });

  it("exports ParserOptions type", () => {
    const options: ParserOptions = {
      gfm: true,
      math: true,
    };
    expect(options.gfm).toBe(true);
  });

  it("MarkdownNode supports all node types", () => {
    const types: MarkdownNode["type"][] = [
      "document",
      "heading",
      "paragraph",
      "text",
      "bold",
      "italic",
      "strikethrough",
      "link",
      "image",
      "code_inline",
      "code_block",
      "blockquote",
      "horizontal_rule",
      "line_break",
      "soft_break",
      "table",
      "table_head",
      "table_body",
      "table_row",
      "table_cell",
      "list",
      "list_item",
      "task_list_item",
      "math_inline",
      "math_block",
      "html_block",
      "html_inline",
    ];
    expect(types).toHaveLength(27);
  });

  it("MarkdownNode has optional properties", () => {
    const minimal: MarkdownNode = { type: "text" };
    expect(minimal.content).toBeUndefined();
    expect(minimal.children).toBeUndefined();
    expect(minimal.level).toBeUndefined();
    expect(minimal.href).toBeUndefined();
    expect(minimal.title).toBeUndefined();
    expect(minimal.alt).toBeUndefined();
    expect(minimal.language).toBeUndefined();
    expect(minimal.ordered).toBeUndefined();
    expect(minimal.start).toBeUndefined();
    expect(minimal.checked).toBeUndefined();
    expect(minimal.isHeader).toBeUndefined();
    expect(minimal.align).toBeUndefined();
  });

  it("MarkdownNode children are typed correctly", () => {
    const parent: MarkdownNode = {
      type: "document",
      children: [
        {
          type: "heading",
          level: 1,
          children: [{ type: "text", content: "Hi" }],
        },
        { type: "paragraph", children: [{ type: "text", content: "Hello" }] },
      ],
    };
    expect(parent.children![0].type).toBe("heading");
    expect(parent.children![0].level).toBe(1);
  });

  describe("node-specific properties", () => {
    it("heading has level", () => {
      const ast = parseMarkdown("## Heading");
      const heading = ast.children![0];
      expect(heading.level).toBe(2);
    });

    it("link has href and optional title", () => {
      const ast = parseMarkdown('[text](url "title")');
      const para = ast.children![0];
      const link = para.children!.find((c) => c.type === "link")!;
      expect(link.href).toBe("url");
      expect(link.title).toBe("title");
    });

    it("image has href, alt, and optional title", () => {
      const ast = parseMarkdown('![alt](src "title")');
      const para = ast.children![0];
      const image = para.children!.find((c) => c.type === "image")!;
      expect(image.href).toBe("src");
      expect(image.alt).toBe("alt");
      expect(image.title).toBe("title");
    });

    it("code_block has language", () => {
      const ast = parseMarkdown("```typescript\ncode\n```");
      const codeBlock = ast.children![0];
      expect(codeBlock.language).toBe("typescript");
    });

    it("list has ordered and start", () => {
      const ast = parseMarkdown("5. Item");
      const list = ast.children![0];
      expect(list.ordered).toBe(true);
      expect(list.start).toBe(5);
    });

    it("task_list_item has checked", () => {
      const ast = parseMarkdown("- [x] Done");
      const list = ast.children![0];
      const item = list.children![0];
      expect(item.type).toBe("task_list_item");
      expect(item.checked).toBe(true);
    });

    it("table_cell has isHeader and align", () => {
      const ast = parseMarkdown("| A |\n|:--:|\n| B |");
      const table = ast.children![0];
      const head = table.children!.find((c) => c.type === "table_head")!;
      const headerCell = head.children![0].children![0];
      expect(headerCell.isHeader).toBe(true);
      expect(headerCell.align).toBe("center");
    });

    it("code_inline has content", () => {
      const ast = parseMarkdown("`code`");
      const para = ast.children![0];
      const code = para.children!.find((c) => c.type === "code_inline")!;
      expect(code.content).toBe("code");
    });

    it("text has content", () => {
      const ast = parseMarkdown("Hello");
      const para = ast.children![0];
      const text = para.children!.find((c) => c.type === "text")!;
      expect(text.content).toBe("Hello");
    });
  });
});
