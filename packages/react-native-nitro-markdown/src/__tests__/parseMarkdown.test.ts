import { mockParser } from "./setup";
import { parseMarkdown, parseMarkdownWithOptions } from "../index";

describe("parseMarkdown", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("basic parsing", () => {
    it("returns a document node as root", () => {
      const ast = parseMarkdown("Hello");
      expect(ast.type).toBe("document");
      expect(ast.children).toBeDefined();
    });

    it("parses plain text into a paragraph", () => {
      const ast = parseMarkdown("Hello world");
      expect(ast.children).toHaveLength(1);
      expect(ast.children![0].type).toBe("paragraph");
    });

    it("calls the native parser with the input text", () => {
      parseMarkdown("Test input");
      expect(mockParser.parse).toHaveBeenCalledWith("Test input");
    });

    it("handles empty input", () => {
      const ast = parseMarkdown("");
      expect(ast.type).toBe("document");
      expect(ast.children).toHaveLength(0);
    });
  });

  describe("headings", () => {
    it("parses h1 heading", () => {
      const ast = parseMarkdown("# Heading 1");
      const heading = ast.children![0];
      expect(heading.type).toBe("heading");
      expect(heading.level).toBe(1);
    });

    it("parses h2 heading", () => {
      const ast = parseMarkdown("## Heading 2");
      const heading = ast.children![0];
      expect(heading.type).toBe("heading");
      expect(heading.level).toBe(2);
    });

    it("parses h3 heading", () => {
      const ast = parseMarkdown("### Heading 3");
      const heading = ast.children![0];
      expect(heading.type).toBe("heading");
      expect(heading.level).toBe(3);
    });

    it("parses h4 heading", () => {
      const ast = parseMarkdown("#### Heading 4");
      const heading = ast.children![0];
      expect(heading.type).toBe("heading");
      expect(heading.level).toBe(4);
    });

    it("parses h5 heading", () => {
      const ast = parseMarkdown("##### Heading 5");
      const heading = ast.children![0];
      expect(heading.type).toBe("heading");
      expect(heading.level).toBe(5);
    });

    it("parses h6 heading", () => {
      const ast = parseMarkdown("###### Heading 6");
      const heading = ast.children![0];
      expect(heading.type).toBe("heading");
      expect(heading.level).toBe(6);
    });

    it("parses heading with inline formatting", () => {
      const ast = parseMarkdown("# Hello **World**");
      const heading = ast.children![0];
      expect(heading.type).toBe("heading");
      expect(heading.children).toBeDefined();
      const boldNode = heading.children!.find((c) => c.type === "bold");
      expect(boldNode).toBeDefined();
    });
  });

  describe("inline formatting", () => {
    it("parses bold text with asterisks", () => {
      const ast = parseMarkdown("**bold**");
      const para = ast.children![0];
      const bold = para.children!.find((c) => c.type === "bold");
      expect(bold).toBeDefined();
      expect(bold!.children![0].content).toBe("bold");
    });

    it("parses bold text with underscores", () => {
      const ast = parseMarkdown("__bold__");
      const para = ast.children![0];
      const bold = para.children!.find((c) => c.type === "bold");
      expect(bold).toBeDefined();
    });

    it("parses italic text with asterisks", () => {
      const ast = parseMarkdown("*italic*");
      const para = ast.children![0];
      const italic = para.children!.find((c) => c.type === "italic");
      expect(italic).toBeDefined();
      expect(italic!.children![0].content).toBe("italic");
    });

    it("parses italic text with underscores", () => {
      const ast = parseMarkdown("_italic_");
      const para = ast.children![0];
      const italic = para.children!.find((c) => c.type === "italic");
      expect(italic).toBeDefined();
    });

    it("parses inline code", () => {
      const ast = parseMarkdown("`code`");
      const para = ast.children![0];
      const code = para.children!.find((c) => c.type === "code_inline");
      expect(code).toBeDefined();
      expect(code!.content).toBe("code");
    });

    it("parses nested bold and italic", () => {
      const ast = parseMarkdown("**bold *and italic***");
      const para = ast.children![0];
      const bold = para.children!.find((c) => c.type === "bold");
      expect(bold).toBeDefined();
    });
  });

  describe("links and images", () => {
    it("parses a link", () => {
      const ast = parseMarkdown("[text](https://example.com)");
      const para = ast.children![0];
      const link = para.children!.find((c) => c.type === "link");
      expect(link).toBeDefined();
      expect(link!.href).toBe("https://example.com");
      expect(link!.children![0].content).toBe("text");
    });

    it("parses a link with title", () => {
      const ast = parseMarkdown('[text](https://example.com "Title")');
      const para = ast.children![0];
      const link = para.children!.find((c) => c.type === "link");
      expect(link).toBeDefined();
      expect(link!.href).toBe("https://example.com");
      expect(link!.title).toBe("Title");
    });

    it("parses an image", () => {
      const ast = parseMarkdown("![alt text](https://example.com/image.png)");
      const para = ast.children![0];
      const image = para.children!.find((c) => c.type === "image");
      expect(image).toBeDefined();
      expect(image!.href).toBe("https://example.com/image.png");
      expect(image!.alt).toBe("alt text");
    });

    it("parses an image with title", () => {
      const ast = parseMarkdown(
        '![alt](https://example.com/img.png "Image Title")',
      );
      const para = ast.children![0];
      const image = para.children!.find((c) => c.type === "image");
      expect(image).toBeDefined();
      expect(image!.title).toBe("Image Title");
    });
  });

  describe("code blocks", () => {
    it("parses a code block without language", () => {
      const ast = parseMarkdown("```\ncode here\n```");
      const codeBlock = ast.children![0];
      expect(codeBlock.type).toBe("code_block");
      expect(codeBlock.language).toBeUndefined();
    });

    it("parses a code block with language", () => {
      const ast = parseMarkdown("```typescript\nconst x = 1;\n```");
      const codeBlock = ast.children![0];
      expect(codeBlock.type).toBe("code_block");
      expect(codeBlock.language).toBe("typescript");
    });

    it("preserves code content", () => {
      const ast = parseMarkdown("```\nline1\nline2\n```");
      const codeBlock = ast.children![0];
      const textContent = codeBlock.children![0].content;
      expect(textContent).toContain("line1");
      expect(textContent).toContain("line2");
    });
  });

  describe("blockquotes", () => {
    it("parses a simple blockquote", () => {
      const ast = parseMarkdown("> Quote text");
      const quote = ast.children![0];
      expect(quote.type).toBe("blockquote");
    });

    it("parses multi-line blockquote", () => {
      const ast = parseMarkdown("> Line 1\n> Line 2");
      const quote = ast.children![0];
      expect(quote.type).toBe("blockquote");
    });
  });

  describe("lists", () => {
    it("parses unordered list with dashes", () => {
      const ast = parseMarkdown("- Item 1\n- Item 2");
      const list = ast.children![0];
      expect(list.type).toBe("list");
      expect(list.ordered).toBe(false);
      expect(list.children).toHaveLength(2);
    });

    it("parses unordered list with asterisks", () => {
      const ast = parseMarkdown("* Item 1\n* Item 2");
      const list = ast.children![0];
      expect(list.type).toBe("list");
      expect(list.ordered).toBe(false);
    });

    it("parses ordered list", () => {
      const ast = parseMarkdown("1. First\n2. Second");
      const list = ast.children![0];
      expect(list.type).toBe("list");
      expect(list.ordered).toBe(true);
      expect(list.start).toBe(1);
    });

    it("parses ordered list with custom start", () => {
      const ast = parseMarkdown("5. Fifth\n6. Sixth");
      const list = ast.children![0];
      expect(list.type).toBe("list");
      expect(list.ordered).toBe(true);
      expect(list.start).toBe(5);
    });

    it("parses list items with inline formatting", () => {
      const ast = parseMarkdown("- **Bold** item");
      const list = ast.children![0];
      const item = list.children![0];
      expect(item.type).toBe("list_item");
    });

    it("parses list items with inline code without unwanted line breaks", () => {
      const ast = parseMarkdown(
        "- [ ] Reply to Sarah's email about the `Series A` discussion",
      );
      const list = ast.children![0];
      const taskItem = list.children![0];

      expect(taskItem.type).toBe("task_list_item");
      expect(taskItem.checked).toBe(false);

      // Get the paragraph inside the task item
      const paragraph = taskItem.children!.find((c) => c.type === "paragraph");
      expect(paragraph).toBeDefined();

      // Verify the paragraph children flow correctly: text -> code_inline -> text
      const children = paragraph!.children!;
      expect(children.length).toBeGreaterThanOrEqual(3);

      // Find text nodes and code_inline node
      const textNodes = children.filter((c) => c.type === "text");
      const codeNode = children.find((c) => c.type === "code_inline");

      expect(codeNode).toBeDefined();
      expect(codeNode!.content).toBe("Series A");
      expect(textNodes.length).toBeGreaterThanOrEqual(2);

      // Verify text flows together - first text should contain "about the"
      const firstText = textNodes.find((t) => t.content?.includes("about the"));
      expect(firstText).toBeDefined();

      // Verify no line breaks or soft breaks between text and code
      const hasUnwantedBreaks = children.some((c, i) => {
        if (i === 0) return false;
        const prev = children[i - 1];
        return (
          (c.type === "line_break" || c.type === "soft_break") &&
          (prev.type === "text" || prev.type === "code_inline")
        );
      });
      expect(hasUnwantedBreaks).toBe(false);
    });

    it("parses regular list items with inline code without unwanted line breaks", () => {
      const ast = parseMarkdown(
        "- Reply to Sarah's email about the `Series A` discussion",
      );
      const list = ast.children![0];
      const item = list.children![0];

      expect(item.type).toBe("list_item");

      // Get the paragraph inside the list item
      const paragraph = item.children!.find((c) => c.type === "paragraph");
      expect(paragraph).toBeDefined();

      // Verify the paragraph children flow correctly
      const children = paragraph!.children!;
      const codeNode = children.find((c) => c.type === "code_inline");

      expect(codeNode).toBeDefined();
      expect(codeNode!.content).toBe("Series A");

      // Verify no line breaks or soft breaks between text and code
      const hasUnwantedBreaks = children.some((c, i) => {
        if (i === 0) return false;
        const prev = children[i - 1];
        return (
          (c.type === "line_break" || c.type === "soft_break") &&
          (prev.type === "text" || prev.type === "code_inline")
        );
      });
      expect(hasUnwantedBreaks).toBe(false);
    });

    it("parses list items with italic text without unwanted line breaks", () => {
      const ast = parseMarkdown(
        "- Update your notes on the *TechCrunch* meeting",
      );
      const list = ast.children![0];
      const item = list.children![0];

      expect(item.type).toBe("list_item");

      const paragraph = item.children!.find((c) => c.type === "paragraph");
      expect(paragraph).toBeDefined();

      const children = paragraph!.children!;
      const italicNode = children.find((c) => c.type === "italic");

      expect(italicNode).toBeDefined();

      // Verify no line breaks or soft breaks between text and italic
      const hasUnwantedBreaks = children.some((c, i) => {
        if (i === 0) return false;
        const prev = children[i - 1];
        return (
          (c.type === "line_break" || c.type === "soft_break") &&
          (prev.type === "text" || prev.type === "italic")
        );
      });
      expect(hasUnwantedBreaks).toBe(false);
    });
  });

  describe("horizontal rule", () => {
    it("parses horizontal rule with dashes", () => {
      const ast = parseMarkdown("---");
      expect(ast.children![0].type).toBe("horizontal_rule");
    });

    it("parses horizontal rule with asterisks", () => {
      const ast = parseMarkdown("***");
      expect(ast.children![0].type).toBe("horizontal_rule");
    });

    it("parses horizontal rule with underscores", () => {
      const ast = parseMarkdown("___");
      expect(ast.children![0].type).toBe("horizontal_rule");
    });
  });
});

describe("parseMarkdownWithOptions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("calls native parser with options", () => {
    parseMarkdownWithOptions("Test", { gfm: true, math: false });
    expect(mockParser.parseWithOptions).toHaveBeenCalledWith("Test", {
      gfm: true,
      math: false,
    });
  });

  describe("GFM features", () => {
    it("parses strikethrough when GFM enabled", () => {
      const ast = parseMarkdownWithOptions("~~struck~~", {
        gfm: true,
        math: true,
      });
      const para = ast.children![0];
      const strike = para.children!.find((c) => c.type === "strikethrough");
      expect(strike).toBeDefined();
    });

    it("parses task list when GFM enabled", () => {
      const ast = parseMarkdownWithOptions("- [x] Done\n- [ ] Todo", {
        gfm: true,
        math: true,
      });
      const list = ast.children![0];
      expect(list.children![0].type).toBe("task_list_item");
      expect(list.children![0].checked).toBe(true);
      expect(list.children![1].type).toBe("task_list_item");
      expect(list.children![1].checked).toBe(false);
    });

    it("parses tables when GFM enabled", () => {
      const ast = parseMarkdownWithOptions("| A | B |\n|---|---|\n| 1 | 2 |", {
        gfm: true,
        math: true,
      });
      const table = ast.children![0];
      expect(table.type).toBe("table");
    });

    it("does not parse strikethrough when GFM disabled", () => {
      const ast = parseMarkdownWithOptions("~~struck~~", {
        gfm: false,
        math: true,
      });
      const para = ast.children![0];
      const strike = para.children!.find((c) => c.type === "strikethrough");
      expect(strike).toBeUndefined();
    });
  });

  describe("math features", () => {
    it("parses inline math when enabled", () => {
      const ast = parseMarkdownWithOptions("$E = mc^2$", {
        gfm: true,
        math: true,
      });
      const para = ast.children![0];
      const math = para.children!.find((c) => c.type === "math_inline");
      expect(math).toBeDefined();
    });

    it("parses block math when enabled", () => {
      const ast = parseMarkdownWithOptions("$$x = y$$", {
        gfm: true,
        math: true,
      });
      const para = ast.children![0];
      const math = para.children!.find((c) => c.type === "math_block");
      expect(math).toBeDefined();
    });

    it("does not parse math when disabled", () => {
      const ast = parseMarkdownWithOptions("$E = mc^2$", {
        gfm: true,
        math: false,
      });
      const para = ast.children![0];
      const math = para.children!.find((c) => c.type === "math_inline");
      expect(math).toBeUndefined();
    });
  });
});
