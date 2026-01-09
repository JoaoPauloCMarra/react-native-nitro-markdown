import type { TextStyle, ViewStyle } from "react-native";
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
    text: "#e0e0e0",
    textMuted: "#888",
    heading: "#f0f0f0",
    link: "#60a5fa",
    code: "#fbbf24",
    codeBackground: "#1a1a2e",
    codeLanguage: "#4ade80",
    blockquote: "#3b82f6",
    border: "#252525",
    surface: "#151515",
    surfaceLight: "#1a1a1a",
    accent: "#4ade80",
    tableBorder: "#334155",
    tableHeader: "#0f172a",
    tableHeaderText: "#94a3b8",
    tableRowEven: "#0f172a",
    tableRowOdd: "#1e293b",
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
    regular: undefined,
    heading: undefined,
    mono: undefined,
  },
  borderRadius: {
    s: 4,
    m: 8,
    l: 12,
  },
  showCodeLanguage: true,
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
    link: "#0066cc",
    code: undefined,
    codeBackground: "transparent",
    codeLanguage: "#888888",
    blockquote: "#cccccc",
    border: "#cccccc",
    surface: "transparent",
    surfaceLight: "transparent",
    accent: "#0066cc",
    tableBorder: "#cccccc",
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

export const lightMarkdownTheme: MarkdownTheme = {
  colors: {
    text: "#1a1a1a",
    textMuted: "#6b7280",
    heading: "#000000",
    link: "#2563eb",
    code: "#ea580c",
    codeBackground: "#f3f4f6",
    codeLanguage: "#10b981",
    blockquote: "#3b82f6",
    border: "#e5e7eb",
    surface: "#ffffff",
    surfaceLight: "#f9fafb",
    accent: "#10b981",
    tableBorder: "#e5e7eb",
    tableHeader: "#f3f4f6",
    tableHeaderText: "#6b7280",
    tableRowEven: "#ffffff",
    tableRowOdd: "#f9fafb",
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
    regular: undefined,
    heading: undefined,
    mono: undefined,
  },
  borderRadius: {
    s: 4,
    m: 8,
    l: 12,
  },
  showCodeLanguage: true,
};

export const darkMarkdownTheme = defaultMarkdownTheme;

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
