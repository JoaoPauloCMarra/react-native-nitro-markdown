import React, { ReactNode } from "react";
import { View, StyleSheet, ViewStyle } from "react-native";

interface BlockquoteProps {
  children: ReactNode;
  style?: ViewStyle;
}

import { useMarkdownContext } from "../MarkdownContext";
import { useMemo } from "react";

export const Blockquote: React.FC<BlockquoteProps> = ({ children, style }) => {
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
          borderRadius: 4,
        },
      }),
    [theme]
  );

  return <View style={[styles.blockquote, style]}>{children}</View>;
};
