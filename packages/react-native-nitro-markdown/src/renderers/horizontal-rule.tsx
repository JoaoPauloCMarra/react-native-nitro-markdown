import type { FC } from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import { getCachedStyles } from "./style-cache";
import { useMarkdownContext } from "../MarkdownContext";
import type { MarkdownTheme } from "../theme";

type HorizontalRuleProps = {
  style?: ViewStyle;
};

export const HorizontalRule: FC<HorizontalRuleProps> = ({ style }) => {
  const { theme } = useMarkdownContext();
  const styles = getCachedStyles(stylesCache, theme, createStyles);
  return <View style={[styles.horizontalRule, style]} />;
};

type HorizontalRuleStyles = ReturnType<typeof createStyles>;

const stylesCache = new WeakMap<MarkdownTheme, HorizontalRuleStyles>();

const createStyles = (theme: MarkdownTheme) =>
  StyleSheet.create({
    horizontalRule: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginVertical: theme.spacing.xl,
    },
  });
