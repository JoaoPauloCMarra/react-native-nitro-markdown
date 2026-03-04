import type { ColumnWidthAction } from "./types";

export const DEFAULT_MIN_COLUMN_WIDTH = 60;
export const DEFAULT_MEASUREMENT_STABILIZE_MS = 140;

export function columnWidthsReducer(
  state: number[],
  action: ColumnWidthAction,
): number[] {
  if (action.type === "RESET_WIDTHS") {
    if (
      state.length === action.widths.length &&
      state.every((width, index) => width === action.widths[index])
    ) {
      return state;
    }
    return action.widths;
  }

  if (action.type === "SET_MONOTONIC_WIDTHS") {
    if (state.length !== action.widths.length) {
      return action.widths;
    }

    const merged = action.widths.map((width, index) =>
      Math.max(width, state[index] ?? width),
    );

    if (state.every((width, index) => width === merged[index])) {
      return state;
    }
    return merged;
  }

  return state;
}
