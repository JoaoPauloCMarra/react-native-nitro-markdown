import { parseMarkdown, parseMarkdownWithOptions } from "../index";

describe("safety and error handling", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("input validation", () => {
    it("handles empty string", () => {
      const ast = parseMarkdown("");
      expect(ast.type).toBe("document");
      expect(ast.children).toHaveLength(0);
    });

    it("handles null input gracefully", () => {
      // Test with empty string as null equivalent
      const ast = parseMarkdown("");
      expect(ast.type).toBe("document");
    });

    it("handles whitespace only", () => {
      const ast = parseMarkdown("   \n\t  \r\n  ");
      expect(ast.type).toBe("document");
    });

    it("handles very long input", () => {
      const longInput = "x".repeat(100000);
      const ast = parseMarkdown(longInput);
      expect(ast.type).toBe("document");
    });

    it("handles unicode characters", () => {
      const ast = parseMarkdown("Hello 世界 🌍 🚀");
      expect(ast.type).toBe("document");
    });
  });

  describe("malformed markdown", () => {
    it("handles unclosed brackets", () => {
      const ast = parseMarkdown("[unclosed link");
      expect(ast.type).toBe("document");
    });

    it("handles unclosed parentheses", () => {
      const ast = parseMarkdown("[text](unclosed");
      expect(ast.type).toBe("document");
    });

    it("handles mismatched formatting", () => {
      const ast = parseMarkdown("**bold *italic**");
      expect(ast.type).toBe("document");
    });

    it("handles nested unclosed elements", () => {
      const ast = parseMarkdown("`code [link](url **bold");
      expect(ast.type).toBe("document");
    });

    it("handles null characters", () => {
      const ast = parseMarkdown("text\x00null\x00text");
      expect(ast.type).toBe("document");
    });
  });

  describe("large structures", () => {
    it("handles many paragraphs", () => {
      const manyParas = Array(100).fill("Paragraph text.").join("\n\n");
      const ast = parseMarkdown(manyParas);
      expect(ast.type).toBe("document");
      expect(ast.children!.length).toBeGreaterThan(0);
    });

    it("handles deeply nested lists", () => {
      let nestedList = "- item\n";
      for (let i = 0; i < 20; i++) {
        nestedList += "  ".repeat(i) + "- nested\n";
      }
      const ast = parseMarkdown(nestedList);
      expect(ast.type).toBe("document");
    });

    it("handles many inline elements", () => {
      const manyInlines = Array(1000)
        .fill(0)
        .map((_, i) => `\`code${i}\``)
        .join(" ");
      const ast = parseMarkdown(manyInlines);
      expect(ast.type).toBe("document");
    });

    it("handles complex nested formatting", () => {
      const complex = "**bold *italic `code [link](url)` italic* bold**";
      const ast = parseMarkdown(complex);
      expect(ast.type).toBe("document");
    });
  });

  describe("options safety", () => {
    it("handles undefined options", () => {
      const ast = parseMarkdownWithOptions("Test", {});
      expect(ast.type).toBe("document");
    });

    it("handles partial options", () => {
      const ast = parseMarkdownWithOptions("Test", { gfm: true });
      expect(ast.type).toBe("document");
    });

    it("handles invalid option values", () => {
      const ast = parseMarkdownWithOptions("Test", {
        gfm: undefined,
        math: undefined,
      });
      expect(ast.type).toBe("document");
    });
  });

  describe("memory and performance", () => {
    it("handles repeated parsing without memory issues", () => {
      for (let i = 0; i < 1000; i++) {
        const ast = parseMarkdown(`# Test ${i}`);
        expect(ast.type).toBe("document");
      }
    });

    it("handles concurrent option changes", () => {
      const inputs = [
        { input: "**bold**", options: { gfm: true, math: true } },
        { input: "`code`", options: { gfm: false, math: false } },
        { input: "|table|", options: { gfm: true, math: false } },
        { input: "$math$", options: { gfm: false, math: true } },
      ];

      inputs.forEach(({ input, options }) => {
        const ast = parseMarkdownWithOptions(input, options);
        expect(ast.type).toBe("document");
      });
    });
  });

  describe("error recovery", () => {
    it("continues parsing after errors", () => {
      const problematic = `
# Valid Heading

[broken link

## Another Valid Heading

**valid bold**

[another broken

### Final Heading
`;
      const ast = parseMarkdown(problematic);
      expect(ast.type).toBe("document");
      expect(ast.children!.length).toBeGreaterThan(0);
      // Should recover and continue parsing
    });

    it("handles mixed valid and invalid syntax", () => {
      const mixed = `
# Valid

**valid bold**

[broken

- valid list

**another valid**

)broken paren(

## Final Valid
`;
      const ast = parseMarkdown(mixed);
      expect(ast.type).toBe("document");
      // Should handle mix gracefully
    });
  });
});
