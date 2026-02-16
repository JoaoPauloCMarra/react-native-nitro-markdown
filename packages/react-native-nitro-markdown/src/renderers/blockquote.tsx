import { useMemo, type FC, type ReactNode } from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import { useMarkdownContext } from "../MarkdownContext";

type BlockquoteProps = {
  children: ReactNode;
  style?: ViewStyle;
};

export const Blockquote: FC<BlockquoteProps> = ({ children, style }) => {
  const { theme } = useMarkdownContext();
  const styles = useMemo(
    () =>
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
      }),
    [theme],
  );

  return <View style={[styles.blockquote, style]}>{children}</View>;
};
