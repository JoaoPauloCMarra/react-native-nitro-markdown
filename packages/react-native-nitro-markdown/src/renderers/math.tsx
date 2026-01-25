import { useMemo, type FC, type ComponentType } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useMarkdownContext } from "../MarkdownContext";
import type { MarkdownTheme } from "../theme";

let MathJaxComponent: ComponentType<{
  fontSize?: number;
  color?: string;
  fontCache?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: string;
}> | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mathJaxModule = require("react-native-mathjax-svg");
  MathJaxComponent = mathJaxModule.default || mathJaxModule;
} catch {
  // ignored
}

interface MathInlineProps {
  content?: string;
  style?: ViewStyle;
}

const createMathStyles = (theme: MarkdownTheme) =>
  StyleSheet.create({
    mathInlineContainer: {
      marginHorizontal: 2,
      // Ensure the inline view has layout alignment
      justifyContent: "center",
    },
    mathInlineFallbackContainer: {
      backgroundColor: theme.colors.codeBackground,
      paddingHorizontal: theme.spacing.xs,
      paddingVertical: 2,
      borderRadius: theme.borderRadius.s,
      marginHorizontal: 2,
    },
    mathInlineFallback: {
      fontFamily:
        theme.fontFamilies.mono ??
        Platform.select({ ios: "Courier", android: "monospace" }),
      fontSize: theme.fontSizes.s,
      color: theme.colors.code,
    },
    mathBlockContainer: {
      marginVertical: theme.spacing.m,
      paddingVertical: theme.spacing.l,
      paddingHorizontal: theme.spacing.l,
      backgroundColor: theme.colors.surface,
      borderRadius: theme.borderRadius.l,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
      // Ensure we don't collapse if MathJax fails to report size immediately
      minHeight: 48,
    },
    mathBlockFallbackContainer: {
      marginVertical: theme.spacing.m,
      paddingVertical: theme.spacing.m,
      paddingHorizontal: theme.spacing.l,
      backgroundColor: theme.colors.codeBackground,
      borderRadius: theme.borderRadius.m,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    mathBlockFallback: {
      fontFamily:
        theme.fontFamilies.mono ??
        Platform.select({ ios: "Courier", android: "monospace" }),
      fontSize: theme.fontSizes.m,
      color: theme.colors.code,
      textAlign: "center",
    },
  });

export const MathInline: FC<MathInlineProps> = ({ content, style }) => {
  const { theme } = useMarkdownContext();
  const styles = useMemo(() => createMathStyles(theme), [theme]);

  if (!content) return null;

  if (MathJaxComponent) {
    const fontSize = theme.fontSizes.s;
    return (
      <View style={[styles.mathInlineContainer, style]}>
        <MathJaxComponent
          fontSize={fontSize}
          color={theme.colors.text}
          fontCache={false}
          style={{ backgroundColor: "transparent" }}
        >
          {content}
        </MathJaxComponent>
      </View>
    );
  }

  return (
    <View style={[styles.mathInlineFallbackContainer, style]}>
      <Text style={styles.mathInlineFallback}>{content}</Text>
    </View>
  );
};

interface MathBlockProps {
  content?: string;
  style?: ViewStyle;
}

export const MathBlock: FC<MathBlockProps> = ({ content, style }) => {
  const { theme } = useMarkdownContext();
  const styles = useMemo(() => createMathStyles(theme), [theme]);

  if (!content) return null;

  if (MathJaxComponent) {
    return (
      <View style={[styles.mathBlockContainer, style]}>
        <MathJaxComponent
          fontSize={theme.fontSizes.l}
          color={theme.colors.text}
          fontCache={false}
          style={{ backgroundColor: "transparent" }}
        >
          {`\\displaystyle ${content}`}
        </MathJaxComponent>
      </View>
    );
  }

  return (
    <View style={[styles.mathBlockFallbackContainer, style]}>
      <Text style={styles.mathBlockFallback}>{content}</Text>
    </View>
  );
};
