import { useMemo, type FC, type ReactNode } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Platform,
  type ViewStyle,
  type TextStyle,
} from "react-native";
import { getTextContent } from "../headless";
import { useMarkdownContext } from "../MarkdownContext";
import type { MarkdownNode } from "../headless";
import { defaultHighlighter, type HighlightedToken } from "../utils/code-highlight";

type CodeBlockProps = {
  language?: string;
  content?: string;
  node?: MarkdownNode;
  style?: ViewStyle;
};

export const CodeBlock: FC<CodeBlockProps> = ({
  language,
  content,
  node,
  style,
}) => {
  const ctx = useMarkdownContext();
  const { theme } = ctx;

  const highlighter = ctx.highlightCode === true
    ? defaultHighlighter
    : typeof ctx.highlightCode === 'function'
      ? ctx.highlightCode
      : null;

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
          fontFamily: theme.fontFamilies.mono,
          ...(Platform.OS === "android" && { includeFontPadding: false }),
        },
        codeBlockText: {
          fontFamily:
            theme.fontFamilies.mono ??
            Platform.select({ ios: "Courier", android: "monospace" }),
          fontSize: theme.fontSizes.s,
          color: theme.colors.text,
          lineHeight: theme.fontSizes.s * 1.5,
          ...(Platform.OS === "android" && { includeFontPadding: false }),
        },
      }),
    [theme],
  );

  const showLanguage = theme.showCodeLanguage && language;

  return (
    <View style={[styles.codeBlock, style]}>
      {showLanguage ? (
        <Text style={styles.codeLanguage}>{language}</Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        bounces={false}
      >
        {highlighter && language ? (
          <Text style={styles.codeBlockText} selectable>
            {highlighter(language, displayContent).map((token: HighlightedToken, i: number) => {
              const tokenColor = ctx.theme.colors.codeTokenColors?.[token.type];
              return tokenColor ? (
                <Text key={i} style={{ color: tokenColor }}>
                  {token.text}
                </Text>
              ) : (
                <Text key={i}>{token.text}</Text>
              );
            })}
          </Text>
        ) : (
          <Text style={styles.codeBlockText} selectable>
            {displayContent}
          </Text>
        )}
      </ScrollView>
    </View>
  );
};

type InlineCodeProps = {
  content?: string;
  node?: MarkdownNode;
  children?: ReactNode;
  style?: TextStyle;
};

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
    [theme],
  );
  return <Text style={[styles.codeInline, style]}>{displayContent}</Text>;
};
