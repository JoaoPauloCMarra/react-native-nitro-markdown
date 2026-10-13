import type { MarkdownNode } from "../../headless";
import { readTextContent } from "../../utils/text-content";

const COLUMN_MEASUREMENT_PADDING = 8;
const APPROX_CHAR_WIDTH = 7;
const MAX_ESTIMATED_CHARS = 120;
const ESTIMATED_WIDTH_STEP = 24;

type ExtractedTableData = {
  headers: MarkdownNode[];
  rows: MarkdownNode[][];
  alignments: (string | undefined)[];
  head: MarkdownNode | undefined;
  headRow: MarkdownNode | undefined;
  body: MarkdownNode | undefined;
  rowNodes: MarkdownNode[];
};

export const extractTableData = (node: MarkdownNode): ExtractedTableData => {
  const headers: MarkdownNode[] = [];
  const rows: MarkdownNode[][] = [];
  const alignments: (string | undefined)[] = [];
  const rowNodes: MarkdownNode[] = [];
  let head: MarkdownNode | undefined;
  let headRow: MarkdownNode | undefined;
  let body: MarkdownNode | undefined;

  for (const child of node.children ?? []) {
    if (child.type === "table_head") {
      head = child;
      for (const row of child.children ?? []) {
        if (row.type === "table_row") {
          headRow ??= row;
          for (const cell of row.children ?? []) {
            headers.push(cell);
            alignments.push(cell.align);
          }
        }
      }
    } else if (child.type === "table_body") {
      body = child;
      for (const row of child.children ?? []) {
        if (row.type === "table_row") {
          rowNodes.push(row);
          const rowCells: MarkdownNode[] = [];
          for (const cell of row.children ?? []) {
            rowCells.push(cell);
          }
          rows.push(rowCells);
        }
      }
    }
  }

  return { headers, rows, alignments, head, headRow, body, rowNodes };
};

export const estimateColumnWidths = (
  headers: readonly MarkdownNode[],
  rows: readonly (readonly MarkdownNode[])[],
  columnCount: number,
  minColumnWidth: number,
) => {
  const widths = new Array<number>(columnCount).fill(minColumnWidth);

  for (let col = 0; col < columnCount; col++) {
    const headerChars = Math.min(
      readTextContent(headers[col] ?? { type: "text", content: "" }).trim()
        .length,
      MAX_ESTIMATED_CHARS,
    );
    let maxChars = headerChars;

    for (let row = 0; row < rows.length; row++) {
      const cell = rows[row]?.[col];
      if (!cell) continue;
      const cellChars = Math.min(
        readTextContent(cell).trim().length,
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
