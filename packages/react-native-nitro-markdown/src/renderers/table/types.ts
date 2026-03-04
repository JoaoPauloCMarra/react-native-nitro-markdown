import type { MarkdownNode } from "../../headless";

export type AlignmentType = "left" | "center" | "right" | "default";

export type TableCell = {
  node: MarkdownNode;
  align: AlignmentType;
  isHeader: boolean;
};

export type TableRow = {
  cells: TableCell[];
};

export type TableData = {
  headers: TableCell[];
  rows: TableRow[];
  columnCount: number;
  alignments: AlignmentType[];
};

export type ColumnWidthAction =
  | { type: "RESET_WIDTHS"; widths: number[] }
  | { type: "SET_MONOTONIC_WIDTHS"; widths: number[] };
