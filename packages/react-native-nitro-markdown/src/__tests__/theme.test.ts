import {
  defaultMarkdownTheme,
  minimalMarkdownTheme,
  mergeThemes,
  type MarkdownTheme,
  type PartialMarkdownTheme,
} from "../theme";

describe("mergeThemes", () => {
  it("returns base theme when partial is undefined", () => {
    const result = mergeThemes(defaultMarkdownTheme, undefined);
    expect(result).toBe(defaultMarkdownTheme);
  });

  it("returns base theme when partial is not provided", () => {
    const result = mergeThemes(defaultMarkdownTheme);
    expect(result).toBe(defaultMarkdownTheme);
  });

  it("overrides a single color", () => {
    const partial: PartialMarkdownTheme = {
      colors: { link: "#ff0000" },
    };
    const result = mergeThemes(defaultMarkdownTheme, partial);
    expect(result.colors.link).toBe("#ff0000");
    expect(result.colors.text).toBe(defaultMarkdownTheme.colors.text);
  });

  it("overrides nested spacing values", () => {
    const partial: PartialMarkdownTheme = {
      spacing: { m: 99 },
    };
    const result = mergeThemes(defaultMarkdownTheme, partial);
    expect(result.spacing.m).toBe(99);
    expect(result.spacing.xs).toBe(defaultMarkdownTheme.spacing.xs);
    expect(result.spacing.l).toBe(defaultMarkdownTheme.spacing.l);
  });

  it("overrides fontSizes partially", () => {
    const partial: PartialMarkdownTheme = {
      fontSizes: { h1: 48 },
    };
    const result = mergeThemes(defaultMarkdownTheme, partial);
    expect(result.fontSizes.h1).toBe(48);
    expect(result.fontSizes.m).toBe(defaultMarkdownTheme.fontSizes.m);
  });

  it("overrides fontFamilies partially", () => {
    const partial: PartialMarkdownTheme = {
      fontFamilies: { mono: "JetBrains Mono" },
    };
    const result = mergeThemes(defaultMarkdownTheme, partial);
    expect(result.fontFamilies.mono).toBe("JetBrains Mono");
    expect(result.fontFamilies.regular).toBe(
      defaultMarkdownTheme.fontFamilies.regular,
    );
  });

  it("overrides borderRadius partially", () => {
    const partial: PartialMarkdownTheme = {
      borderRadius: { l: 20 },
    };
    const result = mergeThemes(defaultMarkdownTheme, partial);
    expect(result.borderRadius.l).toBe(20);
    expect(result.borderRadius.s).toBe(defaultMarkdownTheme.borderRadius.s);
  });

  it("overrides headingWeight", () => {
    const partial: PartialMarkdownTheme = {
      headingWeight: "900",
    };
    const result = mergeThemes(defaultMarkdownTheme, partial);
    expect(result.headingWeight).toBe("900");
  });

  it("preserves base headingWeight when partial headingWeight is undefined", () => {
    const base: MarkdownTheme = { ...defaultMarkdownTheme, headingWeight: "700" };
    const partial: PartialMarkdownTheme = {
      colors: { link: "#00f" },
    };
    const result = mergeThemes(base, partial);
    expect(result.headingWeight).toBe("700");
  });

  it("overrides showCodeLanguage", () => {
    const partial: PartialMarkdownTheme = {
      showCodeLanguage: true,
    };
    const result = mergeThemes(defaultMarkdownTheme, partial);
    expect(result.showCodeLanguage).toBe(true);
  });

  it("preserves base showCodeLanguage when partial showCodeLanguage is undefined", () => {
    const base: MarkdownTheme = { ...defaultMarkdownTheme, showCodeLanguage: true };
    const partial: PartialMarkdownTheme = {
      spacing: { xs: 2 },
    };
    const result = mergeThemes(base, partial);
    expect(result.showCodeLanguage).toBe(true);
  });

  it("merges codeTokenColors", () => {
    const partial: PartialMarkdownTheme = {
      colors: {
        codeTokenColors: {
          keyword: "#ff00ff",
        },
      },
    };
    const result = mergeThemes(defaultMarkdownTheme, partial);
    expect(result.colors.codeTokenColors?.keyword).toBe("#ff00ff");
    // Note: shallow spread means other token colors from partial override base entirely
    // because codeTokenColors is inside the colors spread
  });

  it("works with minimal theme as base", () => {
    const partial: PartialMarkdownTheme = {
      colors: { link: "#00ff00" },
    };
    const result = mergeThemes(minimalMarkdownTheme, partial);
    expect(result.colors.link).toBe("#00ff00");
    expect(result.colors.text).toBe(minimalMarkdownTheme.colors.text);
    expect(result.spacing).toEqual(minimalMarkdownTheme.spacing);
  });

  it("does not mutate the base theme", () => {
    const originalLink = defaultMarkdownTheme.colors.link;
    const partial: PartialMarkdownTheme = {
      colors: { link: "#999" },
    };
    mergeThemes(defaultMarkdownTheme, partial);
    expect(defaultMarkdownTheme.colors.link).toBe(originalLink);
  });

  it("returns a new object (not the same reference as base)", () => {
    const partial: PartialMarkdownTheme = {
      colors: { link: "#aaa" },
    };
    const result = mergeThemes(defaultMarkdownTheme, partial);
    expect(result).not.toBe(defaultMarkdownTheme);
  });
});
