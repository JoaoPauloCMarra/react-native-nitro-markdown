import { ReactNode, useMemo, type FC } from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { useMarkdownContext } from "../MarkdownContext";

interface ParagraphProps {
  children: ReactNode;
  inListItem?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Paragraph component that supports mixed content (Text and View elements).
 * Uses View with flexDirection: 'row' and flexWrap: 'wrap' to allow inline flow
 * of both text and non-text elements (like inline math).
 */
export const Paragraph: FC<ParagraphProps> = ({
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

