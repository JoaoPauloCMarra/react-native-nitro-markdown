import { Platform, type TextStyle, type ViewStyle } from "react-native";
import type { MarkdownNode } from "./headless";

export interface MarkdownTheme {
  colors: {
    text: string | undefined;
    textMuted: string | undefined;
    heading: string | undefined;
    link: string | undefined;
    code: string | undefined;
    codeBackground: string | undefined;
    codeLanguage: string | undefined;
    blockquote: string | undefined;
    border: string | undefined;
    surface: string | undefined;
    surfaceLight: string | undefined;
    accent: string | undefined;
    tableBorder: string | undefined;
    tableHeader: string | undefined;
    tableHeaderText: string | undefined;
    tableRowEven: string | undefined;
    tableRowOdd: string | undefined;
  };
  spacing: {
    xs: number;
    s: number;
    m: number;
    l: number;
    xl: number;
  };
  fontSizes: {
    xs: number;
    s: number;
    m: number;
    l: number;
    xl: number;
    h1: number;
    h2: number;
    h3: number;
    h4: number;
    h5: number;
    h6: number;
  };
  fontFamilies: {
    regular: string | undefined;
    heading: string | undefined;
    mono: string | undefined;
  };
  borderRadius: {
    s: number;
    m: number;
    l: number;
  };
  showCodeLanguage: boolean;
}

export const defaultMarkdownTheme: MarkdownTheme = {
  colors: {
    text: "#0f172a",
    textMuted: "#64748b",
    heading: "#0f172a",
    link: "#2563eb",
    code: "#0f172a",
    codeBackground: "#f1f5f9",
    codeLanguage: "#94a3b8",
    blockquote: "#cbd5f5",
    border: "#e2e8f0",
    surface: "#ffffff",
    surfaceLight: "#f8fafc",
    accent: "#2563eb",
    tableBorder: "#e2e8f0",
    tableHeader: "#f8fafc",
    tableHeaderText: "#64748b",
    tableRowEven: "transparent",
    tableRowOdd: "#f8fafc",
  },
  spacing: {
    xs: 4,
    s: 8,
    m: 12,
    l: 16,
    xl: 24,
  },
  fontSizes: {
    xs: 12,
    s: 14,
    m: 16,
    l: 18,
    xl: 22,
    h1: 32,
    h2: 26,
    h3: 22,
    h4: 18,
    h5: 16,
    h6: 14,
  },
  fontFamilies: {
    regular: Platform.select({
      ios: "Avenir Next",
      android: "sans-serif",
      default: undefined,
    }),
    heading: Platform.select({
      ios: "Avenir Next",
      android: "sans-serif-medium",
      default: undefined,
    }),
    mono: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }),
  },
  borderRadius: {
    s: 6,
    m: 10,
    l: 14,
  },
  showCodeLanguage: false,
};

export type PartialMarkdownTheme = {
  [K in keyof MarkdownTheme]?: K extends "showCodeLanguage"
    ? MarkdownTheme[K]
    : Partial<MarkdownTheme[K]>;
};

export type NodeStyleOverrides = Partial<
  Record<MarkdownNode["type"], ViewStyle | TextStyle>
>;

export type StylingStrategy = "opinionated" | "minimal";

export const minimalMarkdownTheme: MarkdownTheme = {
  colors: {
    text: undefined,
    textMuted: undefined,
    heading: undefined,
    link: "#2563eb",
    code: undefined,
    codeBackground: "transparent",
    codeLanguage: "#94a3b8",
    blockquote: "#cbd5f5",
    border: "#e2e8f0",
    surface: "transparent",
    surfaceLight: "transparent",
    accent: "#2563eb",
    tableBorder: "#e2e8f0",
    tableHeader: "transparent",
    tableHeaderText: undefined,
    tableRowEven: "transparent",
    tableRowOdd: "transparent",
  },
  spacing: {
    xs: 0,
    s: 0,
    m: 0,
    l: 0,
    xl: 0,
  },
  fontSizes: {
    xs: 12,
    s: 14,
    m: 16,
    l: 18,
    xl: 22,
    h1: 32,
    h2: 26,
    h3: 22,
    h4: 18,
    h5: 16,
    h6: 14,
  },
  fontFamilies: {
    regular: undefined,
    heading: undefined,
    mono: undefined,
  },
  borderRadius: {
    s: 0,
    m: 0,
    l: 0,
  },
  showCodeLanguage: false,
};

export const mergeThemes = (
  base: MarkdownTheme,
  partial?: PartialMarkdownTheme
): MarkdownTheme => {
  if (!partial) return base;
  return {
    colors: { ...base.colors, ...partial.colors },
    spacing: { ...base.spacing, ...partial.spacing },
    fontSizes: { ...base.fontSizes, ...partial.fontSizes },
    fontFamilies: { ...base.fontFamilies, ...partial.fontFamilies },
    borderRadius: { ...base.borderRadius, ...partial.borderRadius },
    showCodeLanguage: partial.showCodeLanguage ?? base.showCodeLanguage,
  };
};
