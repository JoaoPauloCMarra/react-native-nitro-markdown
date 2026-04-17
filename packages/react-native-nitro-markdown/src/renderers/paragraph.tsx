import type { FC, ReactNode } from "react";
import { View, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { getCachedStyles } from "./style-cache";
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
  const styles = getCachedStyles(stylesCache, theme, createStyles);

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

type ParagraphStyles = ReturnType<typeof createStyles>;

const stylesCache = new WeakMap<MarkdownTheme, ParagraphStyles>();

const createStyles = (theme: MarkdownTheme) =>
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
  });
