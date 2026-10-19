import type { FC, ReactNode } from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { createThemedStyles } from "./style-cache";
import { useMarkdownContext } from "../MarkdownContext";
import type { MarkdownTheme } from "../theme";

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
  const styles = getParagraphStyles(theme);

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

const createStyles = (theme: MarkdownTheme) =>
  StyleSheet.create({
    paragraph: {
      width: "100%",
      maxWidth: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      flexShrink: 1,
      marginBottom: theme.spacing.l,
      gap: 0,
    },
    paragraphInListItem: {
      marginBottom: 0,
      marginTop: 0,
    },
  });

const getParagraphStyles = createThemedStyles(createStyles);
