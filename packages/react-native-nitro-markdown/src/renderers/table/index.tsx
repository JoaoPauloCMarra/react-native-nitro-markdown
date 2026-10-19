import {
  useEffect,
  useMemo,
  useRef,
  useReducer,
  useCallback,
  Fragment,
  type FC,
  type ReactElement,
  type ReactNode,
  type ComponentType,
} from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  type ViewStyle,
  type LayoutChangeEvent,
} from "react-native";
import {
  columnWidthsReducer,
  DEFAULT_MIN_COLUMN_WIDTH,
  DEFAULT_MEASUREMENT_STABILIZE_MS,
} from "./table-reducer";
import {
  COLUMN_MEASUREMENT_PADDING,
  extractTableData,
  estimateColumnWidths,
} from "./table-utils";
import {
  areAllCellsMeasured,
  cellKeyOf,
  computeMeasuredColumnWidths,
  expectedCellKeysOf,
} from "./table-measurement";
import type { MarkdownNode } from "../../headless";
import {
  useMarkdownContext,
  type NodeRendererProps,
} from "../../MarkdownContext";
import { createThemedStyles } from "../style-cache";
import type { MarkdownTheme } from "../../theme";

type TableRendererProps = {
  node: MarkdownNode;
  Renderer: ComponentType<NodeRendererProps>;
  style?: ViewStyle;
};

export const TableRenderer: FC<TableRendererProps> = ({
  node,
  Renderer,
  style,
}) => {
  const { theme, tableOptions, renderers, styles: nodeStyles } =
    useMarkdownContext();

  const minColumnWidth =
    tableOptions?.minColumnWidth ?? DEFAULT_MIN_COLUMN_WIDTH;
  const measurementStabilizeMs =
    tableOptions?.measurementStabilizeMs ?? DEFAULT_MEASUREMENT_STABILIZE_MS;

  const { headers, rows, alignments, head, headRow, body, rowNodes } = useMemo(
    () => extractTableData(node),
    [node],
  );

  const columnCount = headers.length;
  const styles = getTableStyles(theme);
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
  const lastCellKeySignatureRef = useRef("");
  const measurementTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [needsMeasurement, setNeedsMeasurement] = useReducer(
    (_previous: boolean, nextValue: boolean) => nextValue,
    false,
  );

  const expectedCellKeys = useMemo(
    () => expectedCellKeysOf({ headers, rows }),
    [headers, rows],
  );

  const expectedCellKeySignature = useMemo(
    () => expectedCellKeys.join("|"),
    [expectedCellKeys],
  );

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

    if (measurementStabilizeMs <= 0) {
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

  useEffect(() => {
    const widthsMap = measuredWidths.current;
    const cellsSet = measuredCells.current;
    return () => {
      widthsMap.clear();
      cellsSet.clear();
    };
  }, []);

  const onCellLayout = useCallback(
    (cellKey: string, width: number) => {
      if (width <= 0 || widthsCalculated.current || !needsMeasurement) return;

      measuredWidths.current.set(cellKey, width);
      measuredCells.current.add(cellKey);

      if (measuredCells.current.size < expectedCellKeys.length) return;

      if (
        !areAllCellsMeasured({
          measuredCells: measuredCells.current,
          expectedCellKeys,
        })
      ) {
        return;
      }

      const maxWidths = computeMeasuredColumnWidths({
        measuredWidths: measuredWidths.current,
        columnCount,
        rowCount: rows.length,
        minColumnWidth,
        padding: COLUMN_MEASUREMENT_PADDING,
      });

      widthsCalculated.current = true;
      setNeedsMeasurement(false);
      dispatch({ type: "RESET_WIDTHS", widths: maxWidths });
    },
    [columnCount, expectedCellKeys, needsMeasurement, rows.length, minColumnWidth],
  );

  const renderCell = (cell: MarkdownNode) => (
    <Renderer
      node={cell}
      depth={0}
      inListItem={false}
      parentIsText={false}
    />
  );

  const wrapWithCustomRenderer = (
    type: "table_head" | "table_body" | "table_row",
    partNode: MarkdownNode | undefined,
    defaultElement: ReactElement,
  ): ReactNode => {
    const custom = renderers[type];
    if (!custom || !partNode) return defaultElement;
    const result = custom({
      node: partNode,
      children: defaultElement,
      Renderer,
    });
    return result === undefined ? defaultElement : result;
  };

  const getAlignment = (
    index: number,
  ): "flex-start" | "center" | "flex-end" => {
    const align = alignments[index];
    if (align === "center") return "center";
    if (align === "right") return "flex-end";
    return "flex-start";
  };

  const tableBackgroundStyle = useMemo(
    () => ({
      backgroundColor:
        style?.backgroundColor ?? theme.colors.surface,
    }),
    [style, theme.colors.surface],
  );

  if (columnCount === 0) return null;

  const hasWidths = columnWidths.length === columnCount;
  const resolvedWidths = hasWidths ? columnWidths : estimatedColumnWidths;

  return (
    <View
      style={[styles.container, style]}
      role="grid"
    >
      {needsMeasurement ? (
        <View style={styles.measurementContainer}>
          <View style={styles.measurementRow}>
            {headers.map((cell, colIndex) => (
              <View
                key={`measure-header-${colIndex}`}
                style={[styles.measurementCell, nodeStyles?.table_cell]}
                onLayout={(e: LayoutChangeEvent) => {
                  onCellLayout(
                    cellKeyOf({ row: 0, col: colIndex, isHeader: true }),
                    e.nativeEvent.layout.width,
                  );
                }}
              >
                {renderCell(cell)}
              </View>
            ))}
          </View>
          {rows.map((row, rowIndex) => (
            <View key={`measure-row-${rowIndex}`} style={styles.measurementRow}>
              {row.map((cell, colIndex) => (
                <View
                  key={`measure-cell-${rowIndex}-${colIndex}`}
                  style={[styles.measurementCell, nodeStyles?.table_cell]}
                  onLayout={(e: LayoutChangeEvent) => {
                    onCellLayout(
                      cellKeyOf({ row: rowIndex, col: colIndex, isHeader: false }),
                      e.nativeEvent.layout.width,
                    );
                  }}
                >
                  {renderCell(cell)}
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
        <View style={[styles.table, tableBackgroundStyle]}>
          {wrapWithCustomRenderer(
            "table_head",
            head,
            <View style={nodeStyles?.table_head}>
              {wrapWithCustomRenderer(
                "table_row",
                headRow,
                <View style={[styles.headerRow, nodeStyles?.table_row]}>
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
                        nodeStyles?.table_cell,
                      ]}
                    >
                      {renderCell(cell)}
                    </View>
                  ))}
                </View>,
              )}
            </View>,
          )}

          {wrapWithCustomRenderer(
            "table_body",
            body,
            <View style={nodeStyles?.table_body}>
              {rows.map((row, rowIndex) => (
                <Fragment key={`row-${rowIndex}`}>
                  {wrapWithCustomRenderer(
                    "table_row",
                    rowNodes[rowIndex],
                    <View
                      style={[
                        styles.bodyRow,
                        rowIndex === rows.length - 1 && styles.lastRow,
                        rowIndex % 2 === 0 ? styles.evenRow : styles.oddRow,
                        nodeStyles?.table_row,
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
                            nodeStyles?.table_cell,
                          ]}
                        >
                          {renderCell(cell)}
                        </View>
                      ))}
                    </View>,
                  )}
                </Fragment>
              ))}
            </View>,
          )}
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
      borderColor: colors.tableBorder,
    },
    headerRow: {
      flexDirection: "row",
      backgroundColor: colors.tableHeader,
      borderBottomWidth: 1,
      borderBottomColor: colors.tableBorder,
    },
    bodyRow: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: colors.tableBorder,
    },
    evenRow: {
      backgroundColor: colors.tableRowEven,
    },
    oddRow: {
      backgroundColor: colors.tableRowOdd,
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
      borderRightColor: colors.tableBorder,
    },
    bodyCell: {
      flexShrink: 0,
      paddingVertical: 10,
      paddingHorizontal: 12,
      minWidth: 60,
      borderRightWidth: 1,
      borderRightColor: colors.tableBorder,
      justifyContent: "center",
    },
    lastCell: {
      borderRightWidth: 0,
    },
  });
};

const getTableStyles = createThemedStyles(createTableStyles);
