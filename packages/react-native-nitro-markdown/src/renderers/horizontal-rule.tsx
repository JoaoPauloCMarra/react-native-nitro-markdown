import type { FC } from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import { createThemedStyles } from "./style-cache";
import { useMarkdownContext } from "../MarkdownContext";
import type { MarkdownTheme } from "../theme";

type HorizontalRuleProps = {
  style?: ViewStyle;
};

export const HorizontalRule: FC<HorizontalRuleProps> = ({ style }) => {
  const { theme } = useMarkdownContext();
  const styles = getHorizontalRuleStyles(theme);
  return (
    <View
      style={[styles.horizontalRule, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
};

const createStyles = (theme: MarkdownTheme) =>
  StyleSheet.create({
    horizontalRule: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginVertical: theme.spacing.xl,
    },
  });

const getHorizontalRuleStyles = createThemedStyles(createStyles);
