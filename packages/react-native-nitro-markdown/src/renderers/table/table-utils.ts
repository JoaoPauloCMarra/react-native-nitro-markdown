import { getTextContent, type MarkdownNode } from "../../headless";

const COLUMN_MEASUREMENT_PADDING = 8;
const APPROX_CHAR_WIDTH = 7;
const MAX_ESTIMATED_CHARS = 120;
const ESTIMATED_WIDTH_STEP = 24;

type ExtractedTableData = {
  headers: MarkdownNode[];
  rows: MarkdownNode[][];
  alignments: (string | undefined)[];
};

export const extractTableData = (node: MarkdownNode): ExtractedTableData => {
  const headers: MarkdownNode[] = [];
  const rows: MarkdownNode[][] = [];
  const alignments: (string | undefined)[] = [];

  for (const child of node.children ?? []) {
    if (child.type === "table_head") {
      for (const row of child.children ?? []) {
        if (row.type === "table_row") {
          for (const cell of row.children ?? []) {
            headers.push(cell);
            alignments.push(cell.align);
          }
        }
      }
    } else if (child.type === "table_body") {
      for (const row of child.children ?? []) {
        if (row.type === "table_row") {
          const rowCells: MarkdownNode[] = [];
          for (const cell of row.children ?? []) {
            rowCells.push(cell);
          }
          rows.push(rowCells);
        }
      }
    }
  }

  return { headers, rows, alignments };
};

export const estimateColumnWidths = (
  headers: MarkdownNode[],
  rows: MarkdownNode[][],
  columnCount: number,
  minColumnWidth: number,
) => {
  const widths = new Array<number>(columnCount).fill(minColumnWidth);

  for (let col = 0; col < columnCount; col++) {
    const headerChars = Math.min(
      getTextContent(headers[col] ?? { type: "text", content: "" }).trim()
        .length,
      MAX_ESTIMATED_CHARS,
    );
    let maxChars = headerChars;

    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row][col];
      if (!cell) continue;
      const cellChars = Math.min(
        getTextContent(cell).trim().length,
        MAX_ESTIMATED_CHARS,
      );
      if (cellChars > maxChars) {
        maxChars = cellChars;
      }
    }

    const estimatedWidth =
      maxChars * APPROX_CHAR_WIDTH + COLUMN_MEASUREMENT_PADDING;
    const steppedEstimatedWidth =
      Math.ceil(estimatedWidth / ESTIMATED_WIDTH_STEP) * ESTIMATED_WIDTH_STEP;
    widths[col] = Math.max(minColumnWidth, steppedEstimatedWidth);
  }

  return widths;
};
