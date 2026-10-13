import type { FC, ComponentType } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import type { MarkdownNode } from "../../headless";
import {
  useMarkdownContext,
  type NodeRendererProps,
} from "../../MarkdownContext";
import { getCachedStyles } from "../style-cache";
import type { MarkdownTheme } from "../../theme";

type TableCellProps = {
  node: MarkdownNode;
  Renderer: ComponentType<NodeRendererProps>;
};

const TEXT_FLOW_TYPES: ReadonlySet<MarkdownNode["type"]> = new Set([
  "text",
  "bold",
  "italic",
  "strikethrough",
  "link",
  "code_inline",
  "soft_break",
  "line_break",
  "html_inline",
]);

const childKey = (child: MarkdownNode, idx: number) =>
  child.beg != null ? `${child.type}-${child.beg}` : `${child.type}-${idx}`;

export const TableCell: FC<TableCellProps> = ({ node, Renderer }) => {
  const { theme } = useMarkdownContext();
  const styles = getCachedStyles(cellStylesCache, theme, createCellStyles);
  const textStyle = node.isHeader ? styles.headerText : styles.cellText;
  const children = node.children;

  if (!children || children.length === 0) {
    return <Text style={textStyle}>{node.content ?? ""}</Text>;
  }

  if (children.every((child) => TEXT_FLOW_TYPES.has(child.type))) {
    return (
      <Text style={textStyle}>
        {children.map((child, idx) => (
          <Renderer
            key={childKey(child, idx)}
            node={child}
            depth={0}
            inListItem={false}
            parentIsText
          />
        ))}
      </Text>
    );
  }

  return (
    <View style={styles.cellContentWrapper}>
      {children.map((child, idx) => (
        <Renderer
          key={childKey(child, idx)}
          node={child}
          depth={0}
          inListItem={false}
          parentIsText={false}
        />
      ))}
    </View>
  );
};

type CellStyles = ReturnType<typeof createCellStyles>;

const cellStylesCache = new WeakMap<MarkdownTheme, CellStyles>();

const createCellStyles = (theme: MarkdownTheme) => {
  const colors = theme?.colors || {};

  return StyleSheet.create({
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
