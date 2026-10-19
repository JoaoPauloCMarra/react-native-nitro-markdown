import type { FC, ComponentType, ReactNode } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import type { MarkdownNode } from "../../headless";
import {
  useMarkdownContext,
  type NodeRendererProps,
} from "../../MarkdownContext";
import { createThemedStyles } from "../style-cache";
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
  const styles = getCellStyles(theme);
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

  const blocks: ReactNode[] = [];
  let run: MarkdownNode[] = [];
  const flushRun = () => {
    if (run.length === 0) return;
    const first = run[0]!;
    blocks.push(
      <Text key={`run-${childKey(first, blocks.length)}`} style={textStyle}>
        {run.map((child, idx) => (
          <Renderer
            key={childKey(child, idx)}
            node={child}
            depth={0}
            inListItem={false}
            parentIsText
          />
        ))}
      </Text>,
    );
    run = [];
  };
  children.forEach((child, idx) => {
    if (TEXT_FLOW_TYPES.has(child.type)) {
      run.push(child);
      return;
    }
    flushRun();
    blocks.push(
      <Renderer
        key={childKey(child, idx)}
        node={child}
        depth={0}
        inListItem={false}
        parentIsText={false}
      />,
    );
  });
  flushRun();

  return <View style={styles.cellContentWrapper}>{blocks}</View>;
};

const createCellStyles = (theme: MarkdownTheme) => {
  const colors = theme?.colors || {};

  return StyleSheet.create({
    headerText: {
      color: colors.tableHeaderText,
      fontSize: theme.fontSizes.xs,
      fontWeight: "600",
      fontFamily: theme.fontFamilies?.regular,
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
    cellText: {
      color: colors.text,
      fontSize: theme.fontSizes.s,
      lineHeight: Math.round(theme.fontSizes.s * 1.4),
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

const getCellStyles = createThemedStyles(createCellStyles);
