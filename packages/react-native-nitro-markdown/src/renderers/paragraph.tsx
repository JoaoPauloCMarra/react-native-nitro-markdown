import { useMemo, type FC, type ReactNode } from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { useMarkdownContext } from "../MarkdownContext";

type ParagraphProps = {
  children: ReactNode;
  inListItem?: boolean;
  style?: StyleProp<ViewStyle>;
};

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
          marginBottom: theme.spacing.l,
          gap: 0,
        },
        paragraphInListItem: {
          marginBottom: 0,
          marginTop: 0,
        },
      }),
    [theme],
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
