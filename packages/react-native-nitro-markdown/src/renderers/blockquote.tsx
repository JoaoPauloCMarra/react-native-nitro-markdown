import { ReactNode, useMemo, type FC } from "react";
import { View, StyleSheet, type ViewStyle } from "react-native";
import { useMarkdownContext } from "../MarkdownContext";

interface BlockquoteProps {
  children: ReactNode;
  style?: ViewStyle;
}

export const Blockquote: FC<BlockquoteProps> = ({ children, style }) => {
  const { theme } = useMarkdownContext();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        blockquote: {
          borderStartWidth: 4,
          borderStartColor: theme.colors.blockquote,
          paddingStart: theme.spacing.l,
          marginVertical: theme.spacing.m,
          backgroundColor: theme.colors.surfaceLight,
          paddingVertical: theme.spacing.m,
          paddingEnd: theme.spacing.m,
          borderRadius: theme.borderRadius.s,
        },
      }),
    [theme]
  );

  return <View style={[styles.blockquote, style]}>{children}</View>;
};
