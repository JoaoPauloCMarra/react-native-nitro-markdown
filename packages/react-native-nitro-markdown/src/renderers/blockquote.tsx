import type { FC, ReactNode } from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import { getCachedStyles } from "./style-cache";
import { useMarkdownContext } from "../MarkdownContext";
import type { MarkdownTheme } from "../theme";

type BlockquoteProps = {
  children: ReactNode;
  style?: ViewStyle;
};

export const Blockquote: FC<BlockquoteProps> = ({ children, style }) => {
  const { theme } = useMarkdownContext();
  const styles = getCachedStyles(stylesCache, theme, createStyles);

  return <View style={[styles.blockquote, style]}>{children}</View>;
};

type BlockquoteStyles = ReturnType<typeof createStyles>;

const stylesCache = new WeakMap<MarkdownTheme, BlockquoteStyles>();

const createStyles = (theme: MarkdownTheme) =>
  StyleSheet.create({
    blockquote: {
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.blockquote,
      paddingLeft: theme.spacing.l,
      marginVertical: theme.spacing.m,
      backgroundColor: theme.colors.surfaceLight,
      paddingVertical: theme.spacing.m,
      paddingRight: theme.spacing.m,
      borderRadius: theme.borderRadius.s,
    },
  });
