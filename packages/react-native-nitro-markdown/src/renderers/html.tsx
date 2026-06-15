import type { FC } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { getCachedStyles } from "./style-cache";
import { useMarkdownContext } from "../MarkdownContext";
import type { MarkdownTheme } from "../theme";

type HtmlInlineProps = {
  content?: string;
  style?: TextStyle;
};

type HtmlBlockProps = {
  content?: string;
  style?: ViewStyle;
};

export const HtmlInline: FC<HtmlInlineProps> = ({ content, style }) => {
  const { theme } = useMarkdownContext();
  const styles = getCachedStyles(htmlStylesCache, theme, createHtmlStyles);

  if (!content) return null;

  return <Text style={[styles.htmlInline, style]}>{content}</Text>;
};

export const HtmlBlock: FC<HtmlBlockProps> = ({ content, style }) => {
  const { theme } = useMarkdownContext();
  const styles = getCachedStyles(htmlStylesCache, theme, createHtmlStyles);

  if (!content) return null;

  return (
    <View style={[styles.htmlBlock, style]}>
      <Text style={styles.htmlBlockText}>{content.trimEnd()}</Text>
    </View>
  );
};

type HtmlStyles = ReturnType<typeof createHtmlStyles>;

const htmlStylesCache = new WeakMap<MarkdownTheme, HtmlStyles>();

const getMonoFontFamily = (theme: MarkdownTheme) =>
  theme.fontFamilies.mono ??
  Platform.select({ ios: "Courier", android: "monospace" });

const createHtmlStyles = (theme: MarkdownTheme) =>
  StyleSheet.create({
    htmlInline: {
      fontFamily: getMonoFontFamily(theme),
      fontSize: theme.fontSizes.s,
      color: theme.colors.textMuted,
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
    htmlBlock: {
      marginBottom: theme.spacing.l,
    },
    htmlBlockText: {
      fontFamily: getMonoFontFamily(theme),
      fontSize: theme.fontSizes.s,
      color: theme.colors.textMuted,
      lineHeight: theme.fontSizes.s * 1.5,
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
  });
