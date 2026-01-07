import React, { useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useMarkdownContext } from "../MarkdownContext";

let MathJaxComponent: React.ComponentType<{
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
}

/**
 * Inline math renderer.
 * Uses react-native-mathjax-svg if installed, otherwise shows raw LaTeX.
 * Note: Renders as a View since SVG can't be nested in Text.
 */

const createMathStyles = (theme: any) =>
  StyleSheet.create({
    mathInlineContainer: {
      flexDirection: "row",
      alignItems: "baseline",
      alignSelf: "baseline",
      justifyContent: "flex-start",
      flexShrink: 1,
      marginHorizontal: 2,
      top: -theme.fontSizes.m,
      marginBottom: 0,
      paddingVertical: 0,
    },
    mathJaxInline: {
      marginTop: 0,
      marginBottom: 0,
    },
    mathInlineFallbackContainer: {
      backgroundColor: theme.colors.codeBackground,
      paddingHorizontal: 4,
      paddingVertical: 2,
      borderRadius: 4,
      alignSelf: "baseline",
      marginHorizontal: 2,
    },
    mathInlineFallback: {
      fontFamily: "monospace",
      fontSize: theme.fontSizes.s,
      color: theme.colors.code,
    },
    mathBlockContainer: {
      marginVertical: theme.spacing.m,
      paddingVertical: theme.spacing.l,
      paddingHorizontal: theme.spacing.l,
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    mathBlockFallbackContainer: {
      marginVertical: theme.spacing.m,
      paddingVertical: theme.spacing.m,
      paddingHorizontal: theme.spacing.l,
      backgroundColor: theme.colors.codeBackground,
      borderRadius: 8,
      alignItems: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    mathBlockFallback: {
      fontFamily: "monospace",
      fontSize: theme.fontSizes.m,
      color: theme.colors.code,
      textAlign: "center",
    },
  });

export const MathInline: React.FC<MathInlineProps> = ({ content }) => {
  const { theme } = useMarkdownContext();
  const styles = useMemo(() => createMathStyles(theme), [theme]);

  if (!content) return null;

  if (MathJaxComponent) {
    const fontSize = theme.fontSizes.m;
    return (
      <View style={styles.mathInlineContainer}>
        <MathJaxComponent
          fontSize={fontSize}
          color={theme.colors.text}
          fontCache={true}
          style={styles.mathJaxInline}
        >
          {content}
        </MathJaxComponent>
      </View>
    );
  }

  return (
    <View style={styles.mathInlineFallbackContainer}>
      <Text style={styles.mathInlineFallback}>{content}</Text>
    </View>
  );
};

interface MathBlockProps {
  content?: string;
}

/**
 * Block math renderer.
 * Uses react-native-mathjax-svg if installed, otherwise shows raw LaTeX.
 */
export const MathBlock: React.FC<MathBlockProps> = ({ content }) => {
  const { theme } = useMarkdownContext();
  const styles = useMemo(() => createMathStyles(theme), [theme]);

  if (!content) return null;

  if (MathJaxComponent) {
    return (
      <View style={styles.mathBlockContainer}>
        <MathJaxComponent
          fontSize={theme.fontSizes.l}
          color={theme.colors.text}
          fontCache={true}
        >
          {`\\displaystyle ${content}`}
        </MathJaxComponent>
      </View>
    );
  }

  return (
    <View style={styles.mathBlockFallbackContainer}>
      <Text style={styles.mathBlockFallback}>{content}</Text>
    </View>
  );
};
