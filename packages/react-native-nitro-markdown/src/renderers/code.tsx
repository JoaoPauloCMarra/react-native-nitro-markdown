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

interface CodeBlockProps {
  language?: string;
  content: string;
  style?: ViewStyle;
}

export const CodeBlock: FC<CodeBlockProps> = ({
  language,
  content,
  style,
}) => {
  const { theme } = useMarkdownContext();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        codeBlock: {
          backgroundColor: theme.colors.codeBackground,
          borderRadius: 8,
          padding: theme.spacing.l,
          marginVertical: theme.spacing.m,
          borderWidth: 1,
          borderColor: theme.colors.border,
        },
        codeLanguage: {
          color: theme.colors.accent,
          fontSize: theme.fontSizes.xs,
          fontWeight: "600",
          marginBottom: theme.spacing.s,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        },
        codeBlockText: {
          fontFamily: Platform.select({ ios: "Courier", android: "monospace" }),
          fontSize: theme.fontSizes.s,
          color: theme.colors.text,
          lineHeight: theme.fontSizes.s * 1.5,
        },
      }),
    [theme]
  );
  return (
    <View style={[styles.codeBlock, style]}>
      {language && <Text style={styles.codeLanguage}>{language}</Text>}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text style={styles.codeBlockText}>{content}</Text>
      </ScrollView>
    </View>
  );
};

interface InlineCodeProps {
  children: ReactNode;
  style?: TextStyle;
}

export const InlineCode: FC<InlineCodeProps> = ({ children, style }) => {
  const { theme } = useMarkdownContext();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        codeInline: {
          fontFamily: Platform.select({ ios: "Courier", android: "monospace" }),
          fontSize: theme.fontSizes.s,
          color: theme.colors.code,
          backgroundColor: theme.colors.codeBackground,
          paddingHorizontal: theme.spacing.xs,
          paddingVertical: 2,
          borderRadius: 4,
          ...(Platform.OS === "android" && { includeFontPadding: false }),
        },
      }),
    [theme]
  );
  return <Text style={[styles.codeInline, style]}>{children}</Text>;
};

