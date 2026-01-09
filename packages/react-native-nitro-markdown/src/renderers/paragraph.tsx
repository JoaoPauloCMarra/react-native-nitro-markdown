import type { ReactNode } from "react";
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { useMarkdownContext } from "../MarkdownContext";
import { useMemo } from "react";

interface ParagraphProps {
  children: ReactNode;
  inListItem?: boolean;
  style?: StyleProp<ViewStyle | any>;
}

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
