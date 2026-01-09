import { ReactNode, useMemo, type FC } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { useMarkdownContext } from "../MarkdownContext";
import type { MarkdownNode } from "../headless";
import { getTextContent } from "../headless";

interface CodeBlockProps {
  language?: string;
  content?: string;
  node?: MarkdownNode;
  style?: ViewStyle;
}

export const CodeBlock: FC<CodeBlockProps> = ({
  language,
  content,
  node,
  style,
}) => {
  const { theme } = useMarkdownContext();

  const displayContent = content ?? (node ? getTextContent(node) : "");

  const styles = useMemo(
    () =>
      StyleSheet.create({
        codeBlock: {
          backgroundColor: theme.colors.codeBackground,
          borderRadius: theme.borderRadius.m,
          padding: theme.spacing.l,
          marginVertical: theme.spacing.m,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        codeLanguage: {
          color: theme.colors.codeLanguage,
          fontSize: theme.fontSizes.xs,
          fontWeight: "600",
          marginBottom: theme.spacing.s,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        },
        codeBlockText: {
          fontFamily:
            theme.fontFamilies.mono ??
            Platform.select({ ios: "Courier", android: "monospace" }),
          fontSize: theme.fontSizes.s,
          color: theme.colors.text,
          lineHeight: theme.fontSizes.s * 1.5,
        },
      }),
    [theme]
  );

  const showLanguage = theme.showCodeLanguage && language;

  return (
    <View style={[styles.codeBlock, style]}>
      {showLanguage && <Text style={styles.codeLanguage}>{language}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text style={styles.codeBlockText}>{displayContent}</Text>
      </ScrollView>
    </View>
  );
};

interface InlineCodeProps {
  content?: string;
  node?: MarkdownNode;
  children?: ReactNode;
  style?: TextStyle;
}

export const InlineCode: FC<InlineCodeProps> = ({
  content,
  node,
  children,
  style,
}) => {
  const { theme } = useMarkdownContext();

  const displayContent =
    content ?? children ?? (node ? getTextContent(node) : "");

  const styles = useMemo(
    () =>
      StyleSheet.create({
        codeInline: {
          fontFamily:
            theme.fontFamilies.mono ??
            Platform.select({ ios: "Courier", android: "monospace" }),
          fontSize: theme.fontSizes.s,
          color: theme.colors.code,
          backgroundColor: theme.colors.codeBackground,
          paddingHorizontal: theme.spacing.xs,
          paddingVertical: 2,
          borderRadius: theme.borderRadius.s,
          ...(Platform.OS === "android" && { includeFontPadding: false }),
        },
      }),
    [theme]
  );
  return <Text style={[styles.codeInline, style]}>{displayContent}</Text>;
};
