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
import { getCachedStyles } from "./style-cache";
import { readTextContent } from "../utils/text-content";
import { useMarkdownContext } from "../MarkdownContext";
import {
  defaultHighlighter,
  type HighlightedToken,
  type TokenType,
} from "../utils/code-highlight";
import type { MarkdownNode } from "../headless";
import type { MarkdownTheme } from "../theme";

type TokenStyles = Partial<Record<TokenType, TextStyle>>;

const tokenStylesCache = new WeakMap<MarkdownTheme, TokenStyles>();

const createTokenStyles = (theme: MarkdownTheme): TokenStyles => {
  const styles: TokenStyles = {};
  const colors = theme.colors.codeTokenColors ?? {};
  for (const [type, color] of Object.entries(colors)) {
    if (color) styles[type as TokenType] = { color };
  }
  return styles;
};

const mergeTokenRuns = (
  tokens: readonly HighlightedToken[],
  tokenStyles: TokenStyles,
): { text: string; style: TextStyle | undefined }[] => {
  const runs: { text: string; style: TextStyle | undefined }[] = [];
  for (const token of tokens) {
    const style = tokenStyles[token.type];
    const previous = runs[runs.length - 1];
    if (previous && previous.style === style) {
      previous.text += token.text;
    } else {
      runs.push({ text: token.text, style });
    }
  }
  return runs;
};

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

  const highlighter =
    ctx.highlightCode === true
      ? defaultHighlighter
      : typeof ctx.highlightCode === "function"
        ? ctx.highlightCode
        : null;

  const displayContent = content ?? (node ? readTextContent(node) : "");
  const tokenStyles = getCachedStyles(tokenStylesCache, theme, createTokenStyles);
  const highlightedRuns = useMemo(
    () =>
      highlighter && language
        ? mergeTokenRuns(highlighter(language, displayContent), tokenStyles)
        : null,
    [displayContent, highlighter, language, tokenStyles],
  );

  const styles = getCachedStyles(codeBlockStylesCache, theme, createCodeStyles);

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
        {highlightedRuns ? (
          <Text style={styles.codeBlockText} selectable>
            {highlightedRuns.map((run, i) =>
              run.style ? (
                <Text key={i} style={run.style}>
                  {run.text}
                </Text>
              ) : (
                <Text key={i}>{run.text}</Text>
              ),
            )}
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
    content ?? children ?? (node ? readTextContent(node) : "");

  const styles = getCachedStyles(
    inlineCodeStylesCache,
    theme,
    createInlineStyles,
  );
  return <Text style={[styles.codeInline, style]}>{displayContent}</Text>;
};

type CodeBlockStyles = ReturnType<typeof createCodeStyles>;
type InlineCodeStyles = ReturnType<typeof createInlineStyles>;

const codeBlockStylesCache = new WeakMap<MarkdownTheme, CodeBlockStyles>();
const inlineCodeStylesCache = new WeakMap<MarkdownTheme, InlineCodeStyles>();

const getMonoFontFamily = (theme: MarkdownTheme) =>
  theme.fontFamilies.mono ??
  Platform.select({ ios: "Courier", android: "monospace" });

const createCodeStyles = (theme: MarkdownTheme) =>
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
      fontFamily: getMonoFontFamily(theme),
      fontSize: theme.fontSizes.s,
      color: theme.colors.text,
      lineHeight: theme.fontSizes.s * 1.5,
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
  });

const createInlineStyles = (theme: MarkdownTheme) =>
  StyleSheet.create({
    codeInline: {
      fontFamily: getMonoFontFamily(theme),
      fontSize: theme.fontSizes.s,
      color: theme.colors.code,
      backgroundColor: theme.colors.codeBackground,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 2,
      borderRadius: theme.borderRadius.s,
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
  });
