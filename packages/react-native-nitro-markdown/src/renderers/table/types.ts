export type ColumnWidthAction =
  | { type: "RESET_WIDTHS"; widths: number[] }
  | { type: "SET_MONOTONIC_WIDTHS"; widths: number[] };
