import { parseMarkdown, parseMarkdownWithOptions } from "../index";
import type { MarkdownNode } from "../index";

describe("math parsing", () => {
  function findMathInline(ast: MarkdownNode): MarkdownNode | undefined {
    for (const child of ast.children ?? []) {
      if (child.type === "math_inline") return child;
      if (child.type === "paragraph") {
        const found = child.children?.find((c) => c.type === "math_inline");
        if (found) return found;
      }
    }
    return undefined;
  }

  function findMathBlock(ast: MarkdownNode): MarkdownNode | undefined {
    for (const child of ast.children ?? []) {
      if (child.type === "math_block") return child;
      if (child.type === "paragraph") {
        const found = child.children?.find((c) => c.type === "math_block");
        if (found) return found;
      }
    }
    return undefined;
  }

  function getMathContent(node: MarkdownNode): string {
    if (node.content) return node.content;
    return node.children?.map((c) => c.content ?? "").join("") ?? "";
  }

  describe("inline math", () => {
    it("parses simple inline math", () => {
      const ast = parseMarkdown("$x = 1$");
      const math = findMathInline(ast);
      expect(math).toBeDefined();
      expect(math!.type).toBe("math_inline");
    });

    it("extracts inline math content", () => {
      const ast = parseMarkdown("$E = mc^2$");
      const math = findMathInline(ast);
      expect(getMathContent(math!)).toBe("E = mc^2");
    });

    it("parses inline math within text", () => {
      const ast = parseMarkdown("The formula $a + b = c$ is simple.");
      const para = ast.children![0];
      expect(para.children?.some((c) => c.type === "math_inline")).toBe(true);
      expect(para.children?.some((c) => c.type === "text")).toBe(true);
    });

    it("parses multiple inline math expressions", () => {
      const ast = parseMarkdown("$a$ and $b$ and $c$");
      const para = ast.children![0];
      const mathNodes = para.children?.filter((c) => c.type === "math_inline");
      expect(mathNodes).toHaveLength(3);
    });

    it("handles complex inline math", () => {
      const ast = parseMarkdown("$\\frac{a}{b}$");
      const math = findMathInline(ast);
      expect(getMathContent(math!)).toBe("\\frac{a}{b}");
    });

    it("handles subscripts and superscripts", () => {
      const ast = parseMarkdown("$x_1^2 + x_2^2$");
      const math = findMathInline(ast);
      expect(getMathContent(math!)).toBe("x_1^2 + x_2^2");
    });

    it("handles Greek letters", () => {
      const ast = parseMarkdown("$\\alpha + \\beta = \\gamma$");
      const math = findMathInline(ast);
      expect(getMathContent(math!)).toContain("\\alpha");
    });
  });

  describe("block math", () => {
    it("parses simple block math", () => {
      const ast = parseMarkdown("$$x = 1$$");
      const math = findMathBlock(ast);
      expect(math).toBeDefined();
      expect(math!.type).toBe("math_block");
    });

    it("extracts block math content", () => {
      const ast = parseMarkdown("$$E = mc^2$$");
      const math = findMathBlock(ast);
      expect(getMathContent(math!)).toBe("E = mc^2");
    });

    it("handles multi-line block math", () => {
      const ast = parseMarkdown("$$\nx = y\nz = w\n$$");
      const math = findMathBlock(ast);
      expect(math).toBeDefined();
    });

    it("handles complex block math", () => {
      const ast = parseMarkdown(
        "$$\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}$$",
      );
      const math = findMathBlock(ast);
      expect(getMathContent(math!)).toContain("\\int");
    });

    it("handles matrices", () => {
      const ast = parseMarkdown(
        "$$\\begin{matrix} a & b \\\\ c & d \\end{matrix}$$",
      );
      const math = findMathBlock(ast);
      expect(getMathContent(math!)).toContain("\\begin{matrix}");
    });
  });

  describe("math disabled", () => {
    it("does not parse inline math when disabled", () => {
      const ast = parseMarkdownWithOptions("$x = 1$", {
        gfm: true,
        math: false,
      });
      const math = findMathInline(ast);
      expect(math).toBeUndefined();
    });

    it("does not parse block math when disabled", () => {
      const ast = parseMarkdownWithOptions("$$x = 1$$", {
        gfm: true,
        math: false,
      });
      const math = findMathBlock(ast);
      expect(math).toBeUndefined();
    });

    it("treats dollar signs as text when math disabled", () => {
      const ast = parseMarkdownWithOptions("Price is $100", {
        gfm: true,
        math: false,
      });
      const para = ast.children![0];
      const hasText = para.children?.some(
        (c) => c.type === "text" && c.content?.includes("$"),
      );
      expect(hasText).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles empty inline math", () => {
      const ast = parseMarkdown("$$");
      expect(ast.type).toBe("document");
    });

    it("handles math with special characters", () => {
      const ast = parseMarkdown("$a < b > c$");
      const math = findMathInline(ast);
      expect(math).toBeDefined();
    });

    it("handles math adjacent to text", () => {
      const ast = parseMarkdown("before$x$after");
      const para = ast.children![0];
      expect(para.children?.length).toBeGreaterThan(1);
    });
  });
});
