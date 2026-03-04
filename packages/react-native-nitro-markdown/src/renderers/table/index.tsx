import {
  useEffect,
  useMemo,
  useRef,
  useReducer,
  useCallback,
  type FC,
  type ComponentType,
} from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Platform,
  type ViewStyle,
  type LayoutChangeEvent,
} from "react-native";
import { useMarkdownContext, type NodeRendererProps } from "../../MarkdownContext";
import type { MarkdownTheme } from "../../theme";
import { CellContent } from "./cell-content";
import { extractTableData, estimateColumnWidths } from "./table-utils";
import {
  columnWidthsReducer,
  DEFAULT_MIN_COLUMN_WIDTH,
  DEFAULT_MEASUREMENT_STABILIZE_MS,
} from "./table-reducer";

type TableRendererProps = {
  node: import("../../headless").MarkdownNode;
  Renderer: ComponentType<NodeRendererProps>;
  style?: ViewStyle;
};

const COLUMN_MEASUREMENT_PADDING = 8;

const IS_ACT_TEST_ENVIRONMENT =
  Reflect.get(globalThis, "IS_REACT_ACT_ENVIRONMENT") === true;
const SHOULD_DEBOUNCE_MEASUREMENT = !IS_ACT_TEST_ENVIRONMENT;

export const TableRenderer: FC<TableRendererProps> = ({
  node,
  Renderer,
  style,
}) => {
  const { theme, tableOptions } = useMarkdownContext();

  const minColumnWidth =
    tableOptions?.minColumnWidth ?? DEFAULT_MIN_COLUMN_WIDTH;
  const measurementStabilizeMs =
    tableOptions?.measurementStabilizeMs ?? DEFAULT_MEASUREMENT_STABILIZE_MS;

  const { headers, rows, alignments } = useMemo(
    () => extractTableData(node),
    [node],
  );

  const columnCount = headers.length;
  const styles = useMemo(() => createTableStyles(theme), [theme]);
  const estimatedColumnWidths = useMemo(
    () => estimateColumnWidths(headers, rows, columnCount, minColumnWidth),
    [headers, rows, columnCount, minColumnWidth],
  );

  const [columnWidths, dispatch] = useReducer(
    columnWidthsReducer,
    estimatedColumnWidths,
  );
  const measuredWidths = useRef<Map<string, number>>(new Map());
  const measuredCells = useRef<Set<string>>(new Set());
  const widthsCalculated = useRef(false);
  const columnWidthsRef = useRef(columnWidths);
  const lastCellKeySignatureRef = useRef("");
  const measurementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [needsMeasurement, setNeedsMeasurement] = useReducer(
    (_previous: boolean, nextValue: boolean) => nextValue,
    false,
  );

  const expectedCellKeys = useMemo(() => {
    const keys: string[] = [];

    headers.forEach((_, colIndex) => {
      keys.push(`header-${colIndex}`);
    });

    rows.forEach((row, rowIndex) => {
      row.forEach((_, colIndex) => {
        keys.push(`cell-${rowIndex}-${colIndex}`);
      });
    });

    return keys;
  }, [headers, rows]);

  const expectedCellKeySignature = useMemo(
    () => expectedCellKeys.join("|"),
    [expectedCellKeys],
  );

  useEffect(() => {
    columnWidthsRef.current = columnWidths;
  }, [columnWidths]);

  useEffect(() => {
    const structureChanged =
      lastCellKeySignatureRef.current !== expectedCellKeySignature;
    lastCellKeySignatureRef.current = expectedCellKeySignature;

    if (measurementTimerRef.current) {
      clearTimeout(measurementTimerRef.current);
      measurementTimerRef.current = null;
    }

    if (structureChanged) {
      measuredWidths.current.clear();
      measuredCells.current.clear();
      widthsCalculated.current = false;
      setNeedsMeasurement(false);
      dispatch({ type: "RESET_WIDTHS", widths: estimatedColumnWidths });
    } else {
      dispatch({
        type: "SET_MONOTONIC_WIDTHS",
        widths: estimatedColumnWidths,
      });
      if (widthsCalculated.current) {
        return;
      }
    }

    if (!SHOULD_DEBOUNCE_MEASUREMENT) {
      setNeedsMeasurement(true);
      return;
    }

    measurementTimerRef.current = setTimeout(() => {
      measurementTimerRef.current = null;
      setNeedsMeasurement(true);
    }, measurementStabilizeMs);

    return () => {
      if (measurementTimerRef.current) {
        clearTimeout(measurementTimerRef.current);
        measurementTimerRef.current = null;
      }
    };
  }, [estimatedColumnWidths, expectedCellKeySignature, measurementStabilizeMs]);

  const onCellLayout = useCallback(
    (cellKey: string, width: number) => {
      if (width <= 0 || widthsCalculated.current || !needsMeasurement) return;

      measuredWidths.current.set(cellKey, width);
      if (!measuredCells.current.has(cellKey)) {
        measuredCells.current.add(cellKey);
      }

      if (measuredCells.current.size < expectedCellKeys.length) return;

      const allCellsMeasured = expectedCellKeys.every((key) =>
        measuredCells.current.has(key),
      );
      if (!allCellsMeasured) return;

      const maxWidths: number[] = [...columnWidthsRef.current];

      for (let col = 0; col < columnCount; col++) {
        const headerWidth = measuredWidths.current.get(`header-${col}`);
        if (headerWidth && headerWidth > 0) {
          maxWidths[col] = Math.max(maxWidths[col], headerWidth);
        }

        for (let row = 0; row < rows.length; row++) {
          if (col >= rows[row].length) continue;
          const cellWidth = measuredWidths.current.get(`cell-${row}-${col}`);
          if (cellWidth && cellWidth > 0) {
            maxWidths[col] = Math.max(maxWidths[col], cellWidth);
          }
        }

        maxWidths[col] = Math.max(
          maxWidths[col] + COLUMN_MEASUREMENT_PADDING,
          minColumnWidth,
        );
      }

      widthsCalculated.current = true;
      setNeedsMeasurement(false);
      dispatch({ type: "RESET_WIDTHS", widths: maxWidths });
    },
    [columnCount, expectedCellKeys, needsMeasurement, rows, minColumnWidth],
  );

  const getAlignment = (
    index: number,
  ): "flex-start" | "center" | "flex-end" => {
    const align = alignments[index];
    if (align === "center") return "center";
    if (align === "right") return "flex-end";
    return "flex-start";
  };

  if (columnCount === 0) return null;

  const hasWidths = columnWidths.length === columnCount;
  const resolvedWidths = hasWidths ? columnWidths : estimatedColumnWidths;

  return (
    <View style={[styles.container, style]}>
      {needsMeasurement ? (
        <View style={styles.measurementContainer}>
          <View style={styles.measurementRow}>
            {headers.map((cell, colIndex) => (
              <View
                key={`measure-header-${colIndex}`}
                style={styles.measurementCell}
                onLayout={(e: LayoutChangeEvent) => {
                  onCellLayout(
                    `header-${colIndex}`,
                    e.nativeEvent.layout.width,
                  );
                }}
              >
                <CellContent node={cell} Renderer={Renderer} styles={styles} />
              </View>
            ))}
          </View>
          {rows.map((row, rowIndex) => (
            <View key={`measure-row-${rowIndex}`} style={styles.measurementRow}>
              {row.map((cell, colIndex) => (
                <View
                  key={`measure-cell-${rowIndex}-${colIndex}`}
                  style={styles.measurementCell}
                  onLayout={(e: LayoutChangeEvent) => {
                    onCellLayout(
                      `cell-${rowIndex}-${colIndex}`,
                      e.nativeEvent.layout.width,
                    );
                  }}
                >
                  <CellContent
                    node={cell}
                    Renderer={Renderer}
                    styles={styles}
                  />
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator
        style={styles.tableScroll}
        bounces={false}
      >
        <View
          style={[
            styles.table,
            {
              backgroundColor:
                style?.backgroundColor ?? theme.colors.surface ?? "#111827",
            },
          ]}
        >
          <View style={styles.headerRow}>
            {headers.map((cell, colIndex) => (
              <View
                key={`header-${colIndex}`}
                style={[
                  styles.headerCell,
                  {
                    width: resolvedWidths[colIndex] ?? minColumnWidth,
                    alignItems: getAlignment(colIndex),
                  },
                  colIndex === columnCount - 1 && styles.lastCell,
                ]}
              >
                <CellContent
                  node={cell}
                  Renderer={Renderer}
                  styles={styles}
                  textStyle={styles.headerText}
                />
              </View>
            ))}
          </View>

          {rows.map((row, rowIndex) => (
            <View
              key={`row-${rowIndex}`}
              style={[
                styles.bodyRow,
                rowIndex === rows.length - 1 && styles.lastRow,
                rowIndex % 2 === 0 ? styles.evenRow : styles.oddRow,
              ]}
            >
              {row.map((cell, colIndex) => (
                <View
                  key={`cell-${rowIndex}-${colIndex}`}
                  style={[
                    styles.bodyCell,
                    {
                      width: resolvedWidths[colIndex] ?? minColumnWidth,
                      alignItems: getAlignment(colIndex),
                    },
                    colIndex === columnCount - 1 && styles.lastCell,
                  ]}
                >
                  <CellContent
                    node={cell}
                    Renderer={Renderer}
                    styles={styles}
                    textStyle={styles.cellText}
                  />
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const createTableStyles = (theme: MarkdownTheme) => {
  const colors = theme?.colors || {};
  const borderRadius = theme?.borderRadius || { m: 8 };

  return StyleSheet.create({
    container: {
      marginVertical: theme.spacing.s,
    },
    measurementContainer: {
      position: "absolute",
      opacity: 0,
      pointerEvents: "none",
      left: -9999,
    },
    measurementRow: {
      flexDirection: "row",
    },
    measurementCell: {
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    tableScroll: {
      flexGrow: 0,
    },
    table: {
      borderRadius: borderRadius.m,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.tableBorder || "#374151",
    },
    headerRow: {
      flexDirection: "row",
      backgroundColor: colors.tableHeader || "#1f2937",
      borderBottomWidth: 1,
      borderBottomColor: colors.tableBorder || "#374151",
    },
    bodyRow: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: colors.tableBorder || "#374151",
    },
    evenRow: {
      backgroundColor: colors.tableRowEven || "transparent",
    },
    oddRow: {
      backgroundColor: colors.tableRowOdd || "rgba(255,255,255,0.02)",
    },
    lastRow: {
      borderBottomWidth: 0,
    },
    headerCell: {
      flexShrink: 0,
      paddingVertical: 10,
      paddingHorizontal: 12,
      minWidth: 60,
      borderRightWidth: 1,
      borderRightColor: colors.tableBorder || "#374151",
    },
    bodyCell: {
      flexShrink: 0,
      paddingVertical: 10,
      paddingHorizontal: 12,
      minWidth: 60,
      borderRightWidth: 1,
      borderRightColor: colors.tableBorder || "#374151",
      justifyContent: "center",
    },
    lastCell: {
      borderRightWidth: 0,
    },
    headerText: {
      color: colors.tableHeaderText || "#9ca3af",
      fontSize: 12,
      fontWeight: "600",
      fontFamily: theme.fontFamilies?.regular,
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
    cellText: {
      color: colors.text || "#e5e7eb",
      fontSize: 14,
      lineHeight: 20,
      fontFamily: theme.fontFamilies?.regular,
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
    cellContentWrapper: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
    },
  });
};
