import React, { ReactNode } from "react";
import { View, StyleSheet, TextStyle } from "react-native";

interface ParagraphProps {
  children: ReactNode;
  inListItem?: boolean;
  style?: TextStyle;
}

/**
 * Paragraph component that supports mixed content (Text and View elements).
 * Uses View with flexDirection: 'row' and flexWrap: 'wrap' to allow inline flow
 * of both text and non-text elements (like inline math).
 */
import { useMarkdownContext } from "../MarkdownContext";
import { useMemo } from "react";

export const Paragraph: React.FC<ParagraphProps> = ({
  children,
  inListItem,
  style,
}) => {
  const { theme } = useMarkdownContext();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        paragraph: {
          flexDirection: "row",
          flexWrap: "wrap",
          alignItems: "baseline",
          marginBottom: theme.spacing.l,
          gap: 0,
        },
        paragraphInListItem: {
          marginBottom: 0,
          marginTop: 0,
          flexShrink: 1,
        },
      }),
    [theme]
  );

  return (
    <View
      style={[
        styles.paragraph,
        inListItem && styles.paragraphInListItem,
        style,
      ]}
    >
      {children}
    </View>
  );
};
