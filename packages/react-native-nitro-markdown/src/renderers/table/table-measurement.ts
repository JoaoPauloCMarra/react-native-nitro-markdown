import type { MarkdownNode } from "../../headless";

export type MeasuredColumnWidthsInput = {
  measuredWidths: ReadonlyMap<string, number>;
  columnCount: number;
  rowCount: number;
  minColumnWidth: number;
  padding: number;
};

/**
 * Pure monotonic-width measurement engine for tables.
 * Given the measured cell widths, computes the final per-column widths as the
 * max of each column's measured cells plus padding, never below the minimum.
 */
export const computeMeasuredColumnWidths = ({
  measuredWidths,
  columnCount,
  rowCount,
  minColumnWidth,
  padding,
}: MeasuredColumnWidthsInput): number[] => {
  const maxWidths: number[] = new Array<number>(columnCount).fill(0);

  for (let col = 0; col < columnCount; col++) {
    const headerWidth = measuredWidths.get(`header-${col}`);
    if (headerWidth && headerWidth > 0) {
      maxWidths[col] = Math.max(maxWidths[col] ?? 0, headerWidth);
    }

    for (let row = 0; row < rowCount; row++) {
      const cellWidth = measuredWidths.get(`cell-${row}-${col}`);
      if (cellWidth && cellWidth > 0) {
        maxWidths[col] = Math.max(maxWidths[col] ?? 0, cellWidth);
      }
    }

    maxWidths[col] = Math.max(
      (maxWidths[col] ?? 0) + padding,
      minColumnWidth,
    );
  }

  return maxWidths;
};

export type AllCellsMeasuredInput = {
  measuredCells: ReadonlySet<string>;
  expectedCellKeys: readonly string[];
};

export const areAllCellsMeasured = ({
  measuredCells,
  expectedCellKeys,
}: AllCellsMeasuredInput): boolean =>
  expectedCellKeys.every((key) => measuredCells.has(key));

export type TableCellKey = {
  row: number;
  col: number;
  isHeader: boolean;
};

export const cellKeyOf = ({ row, col, isHeader }: TableCellKey): string =>
  isHeader ? `header-${col}` : `cell-${row}-${col}`;

export const expectedCellKeysOf = ({
  headers,
  rows,
}: {
  headers: readonly MarkdownNode[];
  rows: readonly (readonly MarkdownNode[])[];
}): string[] => {
  const keys: string[] = [];
  headers.forEach((_, colIndex) => {
    keys.push(cellKeyOf({ row: 0, col: colIndex, isHeader: true }));
  });
  // Enumerate each row's actual cells: ragged rows (fewer cells than header
  // columns) only contribute the keys the measurement pass actually renders.
  // Using headerCount * rowCount here would create keys no cell can ever
  // measure, so the measurement gate would never complete.
  rows.forEach((row, rowIndex) => {
    for (let col = 0; col < row.length; col++) {
      keys.push(cellKeyOf({ row: rowIndex, col, isHeader: false }));
    }
  });
  return keys;
};
