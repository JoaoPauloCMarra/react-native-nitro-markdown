import { parseMarkdown } from "../index";
import type { MarkdownNode } from "../index";

describe("table parsing", () => {
  function findTable(ast: MarkdownNode): MarkdownNode | undefined {
    return ast.children?.find((c) => c.type === "table");
  }

  function getTableHead(table: MarkdownNode): MarkdownNode | undefined {
    return table.children?.find((c) => c.type === "table_head");
  }

  function getTableBody(table: MarkdownNode): MarkdownNode | undefined {
    return table.children?.find((c) => c.type === "table_body");
  }

  describe("basic table structure", () => {
    it("parses a simple 2x2 table", () => {
      const ast = parseMarkdown("| A | B |\n" + "|---|---|\n" + "| 1 | 2 |");
      const table = findTable(ast);
      expect(table).toBeDefined();
      expect(table!.type).toBe("table");
    });

    it("contains table_head and table_body", () => {
      const ast = parseMarkdown("| A | B |\n" + "|---|---|\n" + "| 1 | 2 |");
      const table = findTable(ast)!;
      expect(getTableHead(table)).toBeDefined();
      expect(getTableBody(table)).toBeDefined();
    });

    it("parses header cells correctly", () => {
      const ast = parseMarkdown(
        "| Header 1 | Header 2 |\n" +
          "|----------|----------|\n" +
          "| Cell 1   | Cell 2   |",
      );
      const table = findTable(ast)!;
      const head = getTableHead(table)!;
      const headerRow = head.children![0];
      expect(headerRow.type).toBe("table_row");
      expect(headerRow.children).toHaveLength(2);
      expect(headerRow.children![0].isHeader).toBe(true);
      expect(headerRow.children![1].isHeader).toBe(true);
    });

    it("parses body cells correctly", () => {
      const ast = parseMarkdown("| A | B |\n" + "|---|---|\n" + "| 1 | 2 |");
      const table = findTable(ast)!;
      const body = getTableBody(table)!;
      const bodyRow = body.children![0];
      expect(bodyRow.type).toBe("table_row");
      expect(bodyRow.children![0].isHeader).toBe(false);
    });

    it("parses multiple body rows", () => {
      const ast = parseMarkdown(
        "| A | B |\n" +
          "|---|---|\n" +
          "| 1 | 2 |\n" +
          "| 3 | 4 |\n" +
          "| 5 | 6 |",
      );
      const table = findTable(ast)!;
      const body = getTableBody(table)!;
      expect(body.children).toHaveLength(3);
    });
  });

  describe("table alignment", () => {
    it("parses left alignment", () => {
      const ast = parseMarkdown("| Left |\n" + "|:-----|\n" + "| text |");
      const table = findTable(ast)!;
      const head = getTableHead(table)!;
      const cell = head.children![0].children![0];
      expect(cell.align).toBe("left");
    });

    it("parses right alignment", () => {
      const ast = parseMarkdown("| Right |\n" + "|------:|\n" + "| text  |");
      const table = findTable(ast)!;
      const head = getTableHead(table)!;
      const cell = head.children![0].children![0];
      expect(cell.align).toBe("right");
    });

    it("parses center alignment", () => {
      const ast = parseMarkdown("| Center |\n" + "|:------:|\n" + "| text   |");
      const table = findTable(ast)!;
      const head = getTableHead(table)!;
      const cell = head.children![0].children![0];
      expect(cell.align).toBe("center");
    });

    it("parses mixed alignments", () => {
      const ast = parseMarkdown(
        "| Left | Center | Right |\n" +
          "|:-----|:------:|------:|\n" +
          "| a    | b      | c     |",
      );
      const table = findTable(ast)!;
      const head = getTableHead(table)!;
      const cells = head.children![0].children!;
      expect(cells[0].align).toBe("left");
      expect(cells[1].align).toBe("center");
      expect(cells[2].align).toBe("right");
    });
  });

  describe("table cell content", () => {
    it("parses text content in cells", () => {
      const ast = parseMarkdown("| Hello |\n" + "|-------|\n" + "| World |");
      const table = findTable(ast)!;
      const body = getTableBody(table)!;
      const cell = body.children![0].children![0];
      const textNode = cell.children?.find((c) => c.type === "text");
      expect(textNode?.content).toBe("World");
    });

    it("parses bold text in cells", () => {
      const ast = parseMarkdown("| A |\n" + "|---|\n" + "| **bold** |");
      const table = findTable(ast)!;
      const body = getTableBody(table)!;
      const cell = body.children![0].children![0];
      const boldNode = cell.children?.find((c) => c.type === "bold");
      expect(boldNode).toBeDefined();
    });

    it("parses links in cells", () => {
      const ast = parseMarkdown(
        "| Link |\n" + "|------|\n" + "| [text](url) |",
      );
      const table = findTable(ast)!;
      const body = getTableBody(table)!;
      const cell = body.children![0].children![0];
      const linkNode = cell.children?.find((c) => c.type === "link");
      expect(linkNode).toBeDefined();
      expect(linkNode?.href).toBe("url");
    });

    it("parses inline code in cells", () => {
      const ast = parseMarkdown("| Code |\n" + "|------|\n" + "| `code` |");
      const table = findTable(ast)!;
      const body = getTableBody(table)!;
      const cell = body.children![0].children![0];
      const codeNode = cell.children?.find((c) => c.type === "code_inline");
      expect(codeNode).toBeDefined();
      expect(codeNode?.content).toBe("code");
    });
  });

  describe("large tables", () => {
    it("parses a 5x5 table", () => {
      const ast = parseMarkdown(
        "| A | B | C | D | E |\n" +
          "|---|---|---|---|---|\n" +
          "| 1 | 2 | 3 | 4 | 5 |\n" +
          "| 1 | 2 | 3 | 4 | 5 |\n" +
          "| 1 | 2 | 3 | 4 | 5 |\n" +
          "| 1 | 2 | 3 | 4 | 5 |",
      );
      const table = findTable(ast)!;
      const head = getTableHead(table)!;
      const body = getTableBody(table)!;

      expect(head.children![0].children).toHaveLength(5);
      expect(body.children).toHaveLength(4);
      expect(body.children![0].children).toHaveLength(5);
    });
  });
});
