import "./setup";
import { mergeThemes, defaultMarkdownTheme, minimalMarkdownTheme } from "../theme";

describe("mergeThemes", () => {
  it("returns base theme when partial is undefined", () => {
    expect(mergeThemes(defaultMarkdownTheme)).toBe(defaultMarkdownTheme);
  });

  it("overrides a single color", () => {
    const result = mergeThemes(defaultMarkdownTheme, { colors: { text: "#ff0000" } });
    expect(result.colors.text).toBe("#ff0000");
    expect(result.colors.link).toBe(defaultMarkdownTheme.colors.link);
  });

  it("overrides nested spacing values", () => {
    const result = mergeThemes(defaultMarkdownTheme, { spacing: { xs: 10 } });
    expect(result.spacing.xs).toBe(10);
    expect(result.spacing.m).toBe(defaultMarkdownTheme.spacing.m);
  });

  it("overrides fontSizes partially", () => {
    const result = mergeThemes(defaultMarkdownTheme, { fontSizes: { h1: 40 } });
    expect(result.fontSizes.h1).toBe(40);
    expect(result.fontSizes.m).toBe(defaultMarkdownTheme.fontSizes.m);
  });

  it("overrides fontFamilies partially", () => {
    const result = mergeThemes(defaultMarkdownTheme, { fontFamilies: { mono: "Fira Code" } });
    expect(result.fontFamilies.mono).toBe("Fira Code");
    expect(result.fontFamilies.regular).toBe(defaultMarkdownTheme.fontFamilies.regular);
  });

  it("overrides borderRadius partially", () => {
    const result = mergeThemes(defaultMarkdownTheme, { borderRadius: { s: 0 } });
    expect(result.borderRadius.s).toBe(0);
    expect(result.borderRadius.m).toBe(defaultMarkdownTheme.borderRadius.m);
  });

  it("overrides headingWeight", () => {
    const result = mergeThemes(defaultMarkdownTheme, { headingWeight: "900" });
    expect(result.headingWeight).toBe("900");
  });

  it("preserves base headingWeight when partial is undefined", () => {
    const base = { ...defaultMarkdownTheme, headingWeight: "700" as const };
    const result = mergeThemes(base, { colors: { text: "#000" } });
    expect(result.headingWeight).toBe("700");
  });

  it("overrides showCodeLanguage", () => {
    const result = mergeThemes(defaultMarkdownTheme, { showCodeLanguage: true });
    expect(result.showCodeLanguage).toBe(true);
  });

  it("merges codeTokenColors", () => {
    const result = mergeThemes(defaultMarkdownTheme, {
      colors: { codeTokenColors: { keyword: "#ff0000" } },
    });
    expect(result.colors.codeTokenColors?.keyword).toBe("#ff0000");
  });

  it("works with minimal theme as base", () => {
    const result = mergeThemes(minimalMarkdownTheme, { colors: { text: "#111" } });
    expect(result.colors.text).toBe("#111");
    expect(result.spacing.xs).toBe(0);
  });

  it("does not mutate the base theme", () => {
    const originalText = defaultMarkdownTheme.colors.text;
    mergeThemes(defaultMarkdownTheme, { colors: { text: "#000" } });
    expect(defaultMarkdownTheme.colors.text).toBe(originalText);
  });

  it("returns a new object reference", () => {
    const result = mergeThemes(defaultMarkdownTheme, { colors: { text: "#000" } });
    expect(result).not.toBe(defaultMarkdownTheme);
  });
});
