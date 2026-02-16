import { useMemo, type FC } from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import { useMarkdownContext } from "../MarkdownContext";

type HorizontalRuleProps = {
  style?: ViewStyle;
};

export const HorizontalRule: FC<HorizontalRuleProps> = ({ style }) => {
  const { theme } = useMarkdownContext();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        horizontalRule: {
          height: 1,
          backgroundColor: theme.colors.border,
          marginVertical: theme.spacing.xl,
        },
      }),
    [theme],
  );
  return <View style={[styles.horizontalRule, style]} />;
};
