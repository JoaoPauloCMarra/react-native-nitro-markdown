import { parseMarkdown, parseMarkdownWithOptions } from "../index";

describe("comprehensive markdown features", () => {
  describe("advanced text formatting", () => {
    it("parses bold and italic separately", () => {
      const ast = parseMarkdown("**bold** and *italic*");
      const para = ast.children![0];

      const bold = para.children!.find((c) => c.type === "bold");
      const italic = para.children!.find((c) => c.type === "italic");

      expect(bold).toBeDefined();
      expect(italic).toBeDefined();
      expect(bold!.children![0].content).toBe("bold");
      expect(italic!.children![0].content).toBe("italic");
    });

    it("parses combined formatting in headings", () => {
      const ast = parseMarkdown("# **Bold H1** with *italic* and `code`");
      const heading = ast.children![0];
      expect(heading.type).toBe("heading");
      expect(heading.level).toBe(1);

      const bold = heading.children!.find((c) => c.type === "bold");
      const italic = heading.children!.find((c) => c.type === "italic");
      const code = heading.children!.find((c) => c.type === "code_inline");

      expect(bold).toBeDefined();
      expect(italic).toBeDefined();
      expect(code).toBeDefined();
    });

    it("parses strikethrough in headings", () => {
      const ast = parseMarkdown("## ~~Strikethrough H2~~");
      const heading = ast.children![0];
      expect(heading.type).toBe("heading");
      expect(heading.level).toBe(2);

      const strike = heading.children!.find((c) => c.type === "strikethrough");
      expect(strike).toBeDefined();
    });
  });

  describe("advanced links and images", () => {
    it("parses links with titles", () => {
      const ast = parseMarkdown(
        '[Link with title](https://example.com "Tooltip")',
      );
      const para = ast.children![0];
      const link = para.children!.find((c) => c.type === "link");
      expect(link).toBeDefined();
      expect(link!.href).toBe("https://example.com");
      expect(link!.title).toBe("Tooltip");
    });

    it("parses images with titles", () => {
      const ast = parseMarkdown(
        '![Image with alt](https://example.com/img.png "Image Title")',
      );
      const para = ast.children![0];
      const image = para.children!.find((c) => c.type === "image");
      expect(image).toBeDefined();
      expect(image!.href).toBe("https://example.com/img.png");
      expect(image!.alt).toBe("Image with alt");
      expect(image!.title).toBe("Image Title");
    });

    it("handles multiple links in text", () => {
      const ast = parseMarkdown("[First link](url1) and [second link](url2)");
      const para = ast.children![0];
      const links = para.children!.filter((c) => c.type === "link");
      expect(links).toHaveLength(2);
      expect(links[0].href).toBe("url1");
      expect(links[1].href).toBe("url2");
    });
  });

  describe("advanced table features", () => {
    it("parses tables with all alignment types", () => {
      const ast = parseMarkdown(
        "| Left | Center | Right | Default |\n" +
          "|:-----|:------:|------:|---------|\n" +
          "| L1   | C1     | R1    | D1      |",
      );

      const table = ast.children!.find((c) => c.type === "table");
      expect(table).toBeDefined();

      const head = table!.children!.find((c) => c.type === "table_head");
      const headerRow = head!.children![0];
      const cells = headerRow.children!;

      expect(cells[0].align).toBe("left");
      expect(cells[1].align).toBe("center");
      expect(cells[2].align).toBe("right");
      expect(cells[3].align).toBeUndefined(); // default
    });

    it("parses complex content in table cells", () => {
      const ast = parseMarkdown(
        "| Content |\n" +
          "|---------|\n" +
          "| **Bold** *italic* `code` ~~strike~~ |",
      );

      const table = ast.children!.find((c) => c.type === "table");
      const body = table!.children!.find((c) => c.type === "table_body");
      const cell = body!.children![0].children![0];

      expect(cell.children!.some((c) => c.type === "bold")).toBe(true);
      expect(cell.children!.some((c) => c.type === "italic")).toBe(true);
      expect(cell.children!.some((c) => c.type === "code_inline")).toBe(true);
      expect(cell.children!.some((c) => c.type === "strikethrough")).toBe(true);
    });
  });

  describe("advanced math expressions", () => {
    it("parses complex LaTeX expressions", () => {
      const expressions = [
        "\\frac{d}{dx}[x^n] = nx^{n-1}",
        "\\alpha + \\beta = \\gamma",
        "x_1, x_2, \\dots, x_n",
        "x^2, y^{n+1}, e^{\\pi i}",
      ];

      expressions.forEach((expr) => {
        const ast = parseMarkdownWithOptions(`$${expr}$`, {
          gfm: true,
          math: true,
        });
        const para = ast.children![0];
        const math = para.children!.find((c) => c.type === "math_inline");
        expect(math).toBeDefined();
        expect(math!.children![0].content).toContain(expr);
      });
    });

    it("parses matrix expressions", () => {
      const matrix = "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}";
      const ast = parseMarkdownWithOptions(`$$${matrix}$$`, {
        gfm: true,
        math: true,
      });
      const para = ast.children![0];
      const math = para.children!.find((c) => c.type === "math_block");
      expect(math).toBeDefined();
      expect(math!.children![0].content).toContain(matrix);
    });

    it("handles math in mixed content", () => {
      const ast = parseMarkdownWithOptions("Formula $E = mc^2$ is famous.", {
        gfm: true,
        math: true,
      });

      const para = ast.children![0];
      const inlineMath = para.children!.find((c) => c.type === "math_inline");

      expect(inlineMath).toBeDefined();
      expect(inlineMath!.children![0].content).toBe("E = mc^2");
    });
  });

  describe("advanced list structures", () => {
    it("parses ordered lists", () => {
      const ast = parseMarkdown("1. First item\n2. Second item\n3. Third item");

      const list = ast.children!.find((c) => c.type === "list");
      expect(list).toBeDefined();
      expect(list!.ordered).toBe(true);
      expect(list!.start).toBe(1);
    });

    it("handles basic list formatting", () => {
      const ast = parseMarkdown(
        "- **Bold item**\n" + "- *Italic item*\n" + "- `Code item`",
      );

      const list = ast.children!.find((c) => c.type === "list");
      expect(list).toBeDefined();
      expect(list!.children).toHaveLength(3);

      // Check that items contain the expected formatting
      const items = list!.children!;
      expect(
        items.some((item) =>
          item.children!.some((para) =>
            para.children!.some((c) => c.type === "bold"),
          ),
        ),
      ).toBe(true);
    });
  });

  describe("blockquotes", () => {
    it("parses basic blockquotes", () => {
      const ast = parseMarkdown("> This is a quote\n> with multiple lines");

      const quote = ast.children!.find((c) => c.type === "blockquote");
      expect(quote).toBeDefined();
      expect(quote!.children).toBeDefined();
    });

    it("parses blockquotes with formatting", () => {
      const ast = parseMarkdown("> **Bold** and *italic* in quote");

      const quote = ast.children!.find((c) => c.type === "blockquote");
      expect(quote).toBeDefined();

      // Should contain formatted text
      const para = quote!.children!.find((c) => c.type === "paragraph");
      expect(para).toBeDefined();
    });
  });

  describe("unicode and emoji support", () => {
    it("handles international characters", () => {
      const texts = [
        "Español: Hola mundo 🌍",
        "Français: Bonjour le monde 🌟",
        "Deutsch: Hallo Welt 🚀",
        "中文: 你好世界 💻",
        "日本語: こんにちは世界 🎌",
      ];

      texts.forEach((text) => {
        const ast = parseMarkdown(text);
        expect(ast.type).toBe("document");
        expect(ast.children).toHaveLength(1);
      });
    });

    it("handles emoji combinations", () => {
      const ast = parseMarkdown("🚀 + 💻 + ⚡ = High-performance computing");
      expect(ast.type).toBe("document");

      const para = ast.children![0];
      expect(para.children!.some((c) => c.type === "text")).toBe(true);
    });

    it("handles special unicode characters", () => {
      const specialChars = "© ® ™ ° § ¶ † ‡";
      const ast = parseMarkdown(`Special: ${specialChars}`);
      expect(ast.type).toBe("document");
    });
  });

  describe("edge cases and complex scenarios", () => {
    it("handles extremely long lines", () => {
      const longLine = "Word ".repeat(1000) + "end.";
      const ast = parseMarkdown(longLine);
      expect(ast.type).toBe("document");
      expect(ast.children).toHaveLength(1);
    });

    it("handles mixed content in single paragraph", () => {
      const complex =
        "Text with **bold**, *italic*, ~~strike~~, `code`, [link](url), and $math$.";
      const ast = parseMarkdownWithOptions(complex, { gfm: true, math: true });

      const para = ast.children![0];
      expect(para.children!.some((c) => c.type === "bold")).toBe(true);
      expect(para.children!.some((c) => c.type === "italic")).toBe(true);
      expect(para.children!.some((c) => c.type === "strikethrough")).toBe(true);
      expect(para.children!.some((c) => c.type === "code_inline")).toBe(true);
      expect(para.children!.some((c) => c.type === "link")).toBe(true);
      expect(para.children!.some((c) => c.type === "math_inline")).toBe(true);
    });

    it("handles HTML entities and special characters", () => {
      const entities = "&amp; &lt; &gt; &quot; &#39;";
      const ast = parseMarkdown(`Entities: ${entities}`);
      expect(ast.type).toBe("document");
    });

    it("handles currency symbols", () => {
      const currencies = "$ € ¥ £ ₽ ₿";
      const ast = parseMarkdown(`Currencies: ${currencies}`);
      expect(ast.type).toBe("document");
    });

    it("handles zero-width characters", () => {
      const zwChars = "text\u200B\u200C\u200Dtext"; // Zero-width space, non-joiner, joiner
      const ast = parseMarkdown(zwChars);
      expect(ast.type).toBe("document");
    });
  });

  describe("performance and stress tests", () => {
    it("handles many headings efficiently", () => {
      const manyHeadings = Array(100)
        .fill(0)
        .map((_, i) => `# Heading ${i}`)
        .join("\n\n");
      const start = Date.now();
      const ast = parseMarkdown(manyHeadings);
      const end = Date.now();

      expect(ast.type).toBe("document");
      expect(end - start).toBeLessThan(1000); // Should parse quickly
    });

    it("handles large documents", () => {
      const largeDoc = Array(500)
        .fill("Paragraph with some **bold** and *italic* text.")
        .join("\n\n");
      const start = Date.now();
      const ast = parseMarkdown(largeDoc);
      const end = Date.now();

      expect(ast.type).toBe("document");
      expect(end - start).toBeLessThan(2000); // Should handle large docs reasonably
    });
  });
});
