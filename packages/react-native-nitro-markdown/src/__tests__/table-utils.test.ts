import "./setup";
import type { MarkdownNode } from "../headless";
import { extractTableData, estimateColumnWidths } from "../renderers/table/table-utils";
import { columnWidthsReducer } from "../renderers/table/table-reducer";

const makeTable = (headers: string[], rows: string[][]): MarkdownNode => ({
  type: "table",
  children: [
    {
      type: "table_head",
      children: [{
        type: "table_row",
        children: headers.map((h) => ({
          type: "table_cell" as const,
          isHeader: true,
          children: [{ type: "text" as const, content: h }],
        })),
      }],
    },
    {
      type: "table_body",
      children: rows.map((row) => ({
        type: "table_row" as const,
        children: row.map((cell) => ({
          type: "table_cell" as const,
          isHeader: false,
          children: [{ type: "text" as const, content: cell }],
        })),
      })),
    },
  ],
});

describe("extractTableData", () => {
  it("extracts headers, rows, and alignments", () => {
    const table = makeTable(["H1", "H2"], [["A", "B"]]);
    const result = extractTableData(table);
    expect(result.headers).toHaveLength(2);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toHaveLength(2);
  });

  it("returns empty arrays for table with no children", () => {
    const result = extractTableData({ type: "table" });
    expect(result.headers).toHaveLength(0);
    expect(result.rows).toHaveLength(0);
    expect(result.alignments).toHaveLength(0);
  });

  it("handles table with headers only", () => {
    const table: MarkdownNode = {
      type: "table",
      children: [{
        type: "table_head",
        children: [{
          type: "table_row",
          children: [{ type: "table_cell", isHeader: true, children: [{ type: "text", content: "H" }] }],
        }],
      }],
    };
    const result = extractTableData(table);
    expect(result.headers).toHaveLength(1);
    expect(result.rows).toHaveLength(0);
  });

  it("skips non-table_row children in head/body", () => {
    const table: MarkdownNode = {
      type: "table",
      children: [
        { type: "table_head", children: [{ type: "text", content: "not a row" }] },
        { type: "table_body", children: [{ type: "text", content: "not a row" }] },
      ],
    };
    const result = extractTableData(table);
    expect(result.headers).toHaveLength(0);
    expect(result.rows).toHaveLength(0);
  });

  it("preserves header alignment metadata", () => {
    const table: MarkdownNode = {
      type: "table",
      children: [{
        type: "table_head",
        children: [{
          type: "table_row",
          children: [
            { type: "table_cell", align: "left", children: [{ type: "text", content: "L" }] },
            { type: "table_cell", align: "center", children: [{ type: "text", content: "C" }] },
            { type: "table_cell", align: "right", children: [{ type: "text", content: "R" }] },
          ],
        }],
      }],
    };

    expect(extractTableData(table).alignments).toEqual(["left", "center", "right"]);
  });

  it("keeps empty rows when table row has no cells", () => {
    const table: MarkdownNode = {
      type: "table",
      children: [{
        type: "table_body",
        children: [{ type: "table_row", children: [] }],
      }],
    };

    expect(extractTableData(table).rows).toEqual([[]]);
  });
});

describe("estimateColumnWidths", () => {
  it("returns minimum width for empty cells", () => {
    const headers = [{ type: "text" as const, content: "" }];
    const widths = estimateColumnWidths(headers as MarkdownNode[], [], 1, 60);
    expect(widths[0]).toBeGreaterThanOrEqual(60);
  });

  it("scales width with text length", () => {
    const short = [{ type: "text" as const, content: "Hi" }];
    const long = [{ type: "text" as const, content: "A very long header text" }];
    const shortWidths = estimateColumnWidths(short as MarkdownNode[], [], 1, 60);
    const longWidths = estimateColumnWidths(long as MarkdownNode[], [], 1, 60);
    expect(longWidths[0]).toBeGreaterThanOrEqual(shortWidths[0]);
  });

  it("uses body cell width when wider than header", () => {
    const headers = [{ type: "text" as const, content: "H" }];
    const rows = [[{ type: "text" as const, content: "A much longer cell value here" }]];
    const widths = estimateColumnWidths(headers as MarkdownNode[], rows as MarkdownNode[][], 1, 60);
    const headerOnlyWidths = estimateColumnWidths(headers as MarkdownNode[], [], 1, 60);
    expect(widths[0]).toBeGreaterThanOrEqual(headerOnlyWidths[0]);
  });

  it("uses minimum width for columns without header or body cells", () => {
    const headers = [{ type: "text" as const, content: "H" }];
    const widths = estimateColumnWidths(headers as MarkdownNode[], [], 3, 72);
    expect(widths).toHaveLength(3);
    expect(widths[1]).toBe(72);
    expect(widths[2]).toBe(72);
  });

  it("skips missing body cells without shifting later columns", () => {
    const headers = [
      { type: "text" as const, content: "A" },
      { type: "text" as const, content: "B" },
    ];
    const rows = [
      [{ type: "text" as const, content: "short" }],
      [
        { type: "text" as const, content: "short" },
        { type: "text" as const, content: "much longer second column" },
      ],
    ];

    const widths = estimateColumnWidths(headers as MarkdownNode[], rows as MarkdownNode[][], 2, 60);

    expect(widths[1]).toBeGreaterThan(widths[0]);
  });

  it("caps long content at the maximum estimated width", () => {
    const capped = [{ type: "text" as const, content: "x".repeat(120) }];
    const beyondCap = [{ type: "text" as const, content: "x".repeat(240) }];
    const cappedWidth = estimateColumnWidths(capped as MarkdownNode[], [], 1, 60);
    const beyondCapWidth = estimateColumnWidths(beyondCap as MarkdownNode[], [], 1, 60);

    expect(beyondCapWidth).toEqual(cappedWidth);
  });
});

describe("columnWidthsReducer", () => {
  it("RESET_WIDTHS replaces state", () => {
    const result = columnWidthsReducer([100, 200], { type: "RESET_WIDTHS", widths: [50, 50] });
    expect(result).toEqual([50, 50]);
  });

  it("RESET_WIDTHS returns same reference when widths identical", () => {
    const state = [100, 200];
    const result = columnWidthsReducer(state, { type: "RESET_WIDTHS", widths: [100, 200] });
    expect(result).toBe(state);
  });

  it("SET_MONOTONIC_WIDTHS takes max of each column", () => {
    const result = columnWidthsReducer([100, 50], { type: "SET_MONOTONIC_WIDTHS", widths: [80, 200] });
    expect(result).toEqual([100, 200]);
  });

  it("SET_MONOTONIC_WIDTHS returns same reference when no change", () => {
    const state = [100, 200];
    const result = columnWidthsReducer(state, { type: "SET_MONOTONIC_WIDTHS", widths: [50, 100] });
    expect(result).toBe(state);
  });

  it("SET_MONOTONIC_WIDTHS replaces when length differs", () => {
    const result = columnWidthsReducer([100], { type: "SET_MONOTONIC_WIDTHS", widths: [50, 100] });
    expect(result).toEqual([50, 100]);
  });

  it("returns state for unknown action type", () => {
    const state = [100];
    const result = columnWidthsReducer(state, { type: "UNKNOWN" } as never);
    expect(result).toBe(state);
  });
});
