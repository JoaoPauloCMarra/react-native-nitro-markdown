import { useMemo, type FC, type ReactNode } from "react";
import { Text, StyleSheet, Platform, type TextStyle } from "react-native";
import { useMarkdownContext } from "../MarkdownContext";

type HeadingProps = {
  level: number;
  children: ReactNode;
  style?: TextStyle;
};

const ANDROID_SYSTEM_FONTS = new Set([
  "sans-serif",
  "sans-serif-medium",
  "sans-serif-light",
  "sans-serif-condensed",
  "sans-serif-thin",
  "serif",
  "monospace",
]);

export const Heading: FC<HeadingProps> = ({ level, children, style }) => {
  const { theme } = useMarkdownContext();
  const headingWeight =
    theme.headingWeight ??
    (Platform.OS === "android" &&
    theme.fontFamilies.heading &&
    !ANDROID_SYSTEM_FONTS.has(theme.fontFamilies.heading)
      ? "normal"
      : "700");
  const styles = useMemo(
    () =>
      StyleSheet.create({
        heading: {
          color: theme.colors.heading,
          fontWeight: headingWeight,
          marginTop: theme.spacing.xl,
          marginBottom: theme.spacing.m,
          fontFamily: theme.fontFamilies.heading,
          letterSpacing: -0.2,
          ...(Platform.OS === "android" && { includeFontPadding: false }),
        },
        h1: {
          fontSize: theme.fontSizes.h1,
          lineHeight: theme.fontSizes.h1 * 1.3,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          paddingBottom: theme.spacing.s,
          letterSpacing: -0.6,
        },
        h2: {
          fontSize: theme.fontSizes.h2,
          lineHeight: theme.fontSizes.h2 * 1.3,
          letterSpacing: -0.4,
        },
        h3: {
          fontSize: theme.fontSizes.h3,
          lineHeight: theme.fontSizes.h3 * 1.3,
          letterSpacing: -0.2,
        },
        h4: {
          fontSize: theme.fontSizes.h4,
          lineHeight: theme.fontSizes.h4 * 1.3,
        },
        h5: {
          fontSize: theme.fontSizes.h5,
          lineHeight: theme.fontSizes.h5 * 1.3,
        },
        h6: {
          fontSize: theme.fontSizes.h6,
          lineHeight: theme.fontSizes.h6 * 1.3,
          color: theme.colors.textMuted,
        },
      }),
    [headingWeight, theme],
  );

  const headingStyles = [
    styles.heading,
    level === 1 && styles.h1,
    level === 2 && styles.h2,
    level === 3 && styles.h3,
    level === 4 && styles.h4,
    level === 5 && styles.h5,
    level === 6 && styles.h6,
  ];

  return <Text style={[...headingStyles, style]}>{children}</Text>;
};
