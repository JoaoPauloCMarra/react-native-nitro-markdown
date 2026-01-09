import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  type StyleProp,
  type TextStyle,
} from "react-native";

import type { MarkdownNode } from "../headless";
import { useMarkdownContext, type NodeRendererProps } from "../MarkdownContext";
import { MarkdownTheme } from "../theme";

type TableData = {
  headers: MarkdownNode[];
  rows: MarkdownNode[][];
  alignments: (string | undefined)[];
};

const extractTableData = (node: MarkdownNode): TableData => {
  const headers: MarkdownNode[] = [];
  const rows: MarkdownNode[][] = [];
  const alignments: (string | undefined)[] = [];

  const head = node.children?.find((c) => c.type === "table_head");
  const body = node.children?.find((c) => c.type === "table_body");

  head?.children?.forEach((row) => {
    if (row.type === "table_row") {
      row.children?.forEach((cell) => {
        if (cell.type === "table_cell") {
          headers.push(cell);
          alignments.push(cell.align);
        }
      });
    }
  });

  body?.children?.forEach((row) => {
    if (row.type === "table_row") {
      const rowCells: MarkdownNode[] = [];
      row.children?.forEach((cell) => {
        if (cell.type === "table_cell") {
          rowCells.push(cell);
        }
      });
      if (rowCells.length > 0) rows.push(rowCells);
    }
  });

  return { headers, rows, alignments };
};

interface TableRendererProps {
  node: MarkdownNode;
  Renderer: React.ComponentType<NodeRendererProps>;
}

export const TableRenderer: React.FC<TableRendererProps> = ({
  node,
  Renderer,
}) => {
  const { theme } = useMarkdownContext();
  const { headers, rows, alignments } = useMemo(
    () => extractTableData(node),
    [node]
  );

  const columnCount = headers.length;
  const styles = useMemo(() => createTableStyles(theme), [theme]);

  const [columnWidths, setColumnWidths] = useState<number[]>([]);
  const measuredWidths = useRef<Map<string, number>>(new Map());
  const hasAppliedWidths = useRef(false);

  const calculateAndApplyWidths = useCallback(() => {
    if (columnCount === 0) return;

    const finalWidths = new Array(columnCount).fill(0);
    for (let col = 0; col < columnCount; col++) {
      let maxWidth = measuredWidths.current.get(`h-${col}`) || 0;
      for (let row = 0; row < rows.length; row++) {
        const cellWidth = measuredWidths.current.get(`c-${row}-${col}`) || 0;
        if (cellWidth > maxWidth) maxWidth = cellWidth;
      }
      // Apply padding and min-width
      finalWidths[col] = Math.max(maxWidth + 32, 100);
    }

    setColumnWidths(finalWidths);
    hasAppliedWidths.current = true;
  }, [columnCount, rows.length]);

  useEffect(() => {
    if (columnCount === 0) return;

    const timer = setTimeout(() => {
      if (!hasAppliedWidths.current) {
        calculateAndApplyWidths();
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [columnCount, rows.length, calculateAndApplyWidths]);

  const onLayout = (key: string, width: number) => {
    if (hasAppliedWidths.current) return;
    measuredWidths.current.set(key, width);

    const expectedCount = columnCount + rows.length * columnCount;
    if (measuredWidths.current.size >= expectedCount) {
      calculateAndApplyWidths();
    }
  };

  const getAlignStyle = (index: number) => {
    const align = alignments[index];
    if (align === "center")
      return { alignItems: "center", textAlign: "center" } as const;
    if (align === "right")
      return { alignItems: "flex-end", textAlign: "right" } as const;
    return { alignItems: "flex-start", textAlign: "left" } as const;
  };

  if (columnCount === 0) return null;

  return (
    <View style={styles.container}>
      {!hasAppliedWidths.current && (
        <View style={styles.measurementWrapper} pointerEvents="none">
          <View style={styles.row}>
            {headers.map((cell, i) => (
              <View
                key={`m-h-${i}`}
                onLayout={(e) => onLayout(`h-${i}`, e.nativeEvent.layout.width)}
                style={styles.measuringCell}
              >
                <CellContent node={cell} Renderer={Renderer} styles={styles} />
              </View>
            ))}
          </View>
          {rows.map((row, ri) => (
            <View key={`m-r-${ri}`} style={styles.row}>
              {row.map((cell, ci) => (
                <View
                  key={`m-c-${ri}-${ci}`}
                  onLayout={(e) =>
                    onLayout(`c-${ri}-${ci}`, e.nativeEvent.layout.width)
                  }
                  style={styles.measuringCell}
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

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={true}
        bounces={false}
        style={styles.tableScroll}
      >
        <View style={styles.table}>
          <View style={styles.headerRow}>
            {headers.map((cell, i) => (
              <View
                key={`h-${i}`}
                style={[
                  styles.headerCell,
                  { width: columnWidths[i] || 120 },
                  getAlignStyle(i),
                  i === columnCount - 1 && styles.lastCell,
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

          {rows.map((row, ri) => (
            <View
              key={`r-${ri}`}
              style={[
                styles.bodyRow,
                ri === rows.length - 1 && styles.lastRow,
                ri % 2 === 1 && styles.oddRow,
              ]}
            >
              {row.map((cell, ci) => (
                <View
                  key={`c-${ri}-${ci}`}
                  style={[
                    styles.bodyCell,
                    { width: columnWidths[ci] || 120 },
                    getAlignStyle(ci),
                    ci === columnCount - 1 && styles.lastCell,
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

const CellContent: React.FC<{
  node: MarkdownNode;
  Renderer: React.ComponentType<NodeRendererProps>;
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
  return StyleSheet.create({
    container: {
      marginVertical: 12,
    },
    measurementWrapper: {
      position: "absolute",
      top: 0,
      left: 0,
      opacity: 0,
      zIndex: -1,
    },
    measuringCell: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      alignSelf: "flex-start",
    },
    tableScroll: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.tableBorder || "#374151",
    },
    table: {
      backgroundColor: colors.surface || "#111827",
    },
    row: {
      flexDirection: "row",
    },
    headerRow: {
      flexDirection: "row",
      backgroundColor: colors.tableHeader || "#1f2937",
      borderBottomWidth: 2,
      borderBottomColor: colors.tableBorder || "#374151",
    },
    bodyRow: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: colors.tableBorder || "#374151",
    },
    oddRow: {
      backgroundColor: colors.tableRowOdd || "rgba(255,255,255,0.02)",
    },
    lastRow: {
      borderBottomWidth: 0,
    },
    headerCell: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRightWidth: 1,
      borderRightColor: colors.tableBorder || "#374151",
    },
    bodyCell: {
      paddingVertical: 12,
      paddingHorizontal: 16,
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
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    cellText: {
      color: colors.text || "#e5e7eb",
      fontSize: 14,
      lineHeight: 20,
    },
    cellContentWrapper: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
    },
  });
};
