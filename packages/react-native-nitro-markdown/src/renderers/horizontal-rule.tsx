import React from "react";
import { View, StyleSheet } from "react-native";

import { useMarkdownContext } from "../MarkdownContext";
import { useMemo } from "react";

export const HorizontalRule: React.FC = () => {
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
    [theme]
  );
  return <View style={styles.horizontalRule} />;
};
