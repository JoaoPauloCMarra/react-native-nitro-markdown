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
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
  type LayoutChangeEvent,
} from "react-native";
import { useMarkdownContext, type NodeRendererProps } from "../MarkdownContext";
import type { MarkdownNode } from "../headless";
import type { MarkdownTheme } from "../theme";

type TableData = {
  headers: MarkdownNode[];
  rows: MarkdownNode[][];
  alignments: (string | undefined)[];
};

const extractTableData = (node: MarkdownNode): TableData => {
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

type TableRendererProps = {
  node: MarkdownNode;
  Renderer: ComponentType<NodeRendererProps>;
  style?: ViewStyle;
};

type ColumnWidthsAction = {
  type: "SET_WIDTHS";
  payload: number[];
};

const columnWidthsReducer = (state: number[], action: ColumnWidthsAction) => {
  if (action.type === "SET_WIDTHS") return action.payload;
  return state;
};

export const TableRenderer: FC<TableRendererProps> = ({
  node,
  Renderer,
  style,
}) => {
  const { theme } = useMarkdownContext();
  const { headers, rows, alignments } = useMemo(
    () => extractTableData(node),
    [node],
  );

  const columnCount = headers.length;
  const styles = useMemo(() => createTableStyles(theme), [theme]);

  const [columnWidths, dispatch] = useReducer(columnWidthsReducer, []);
  const measuredWidths = useRef<Map<string, number>>(new Map());
  const measuredCells = useRef<Set<string>>(new Set());
  const widthsCalculated = useRef(false);

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

  useEffect(() => {
    measuredWidths.current.clear();
    measuredCells.current.clear();
    widthsCalculated.current = false;
    dispatch({ type: "SET_WIDTHS", payload: [] });
  }, [expectedCellKeys]);

  const onCellLayout = useCallback(
    (cellKey: string, width: number) => {
      if (widthsCalculated.current) return;

      measuredWidths.current.set(cellKey, width);
      if (!measuredCells.current.has(cellKey)) {
        measuredCells.current.add(cellKey);
      }

      if (measuredCells.current.size < expectedCellKeys.length) return;

      const allCellsMeasured = expectedCellKeys.every((key) =>
        measuredCells.current.has(key),
      );
      if (!allCellsMeasured) return;

      const maxWidths: number[] = new Array(columnCount).fill(0);

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

        maxWidths[col] = Math.max(maxWidths[col] + 8, 60);
      }

      widthsCalculated.current = true;
      dispatch({ type: "SET_WIDTHS", payload: maxWidths });
    },
    [columnCount, expectedCellKeys, rows],
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

  return (
    <View style={[styles.container, style]}>
      {!hasWidths && (
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
      )}

      {hasWidths ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          style={styles.tableScroll}
          bounces={false}
        >
          <View style={[styles.table, { backgroundColor: style?.backgroundColor ?? theme.colors.surface ?? "#111827" }]}>
            <View style={styles.headerRow}>
              {headers.map((cell, colIndex) => (
                <View
                  key={`header-${colIndex}`}
                  style={[
                    styles.headerCell,
                    {
                      width: columnWidths[colIndex],
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
                        width: columnWidths[colIndex],
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
      ) : null}
    </View>
  );
};

const CellContent: FC<{
  node: MarkdownNode;
  Renderer: ComponentType<NodeRendererProps>;
  styles: ReturnType<typeof createTableStyles>;
  textStyle?: StyleProp<TextStyle>;
}> = ({ node, Renderer, styles, textStyle }) => {
  if (!node.children || node.children.length === 0) {
    return <Text style={textStyle}>{node.content ?? ""}</Text>;
  }

  return (
    <View style={styles.cellContentWrapper}>
      {node.children.map((child, idx) => (
        <Renderer
          key={idx}
          node={child}
          depth={0}
          inListItem={false}
          parentIsText={false}
        />
      ))}
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
