import type { MarkdownTheme } from "../theme";

export function createThemedStyles<T>(
  create: (theme: MarkdownTheme) => T,
): (theme: MarkdownTheme) => T {
  const cache = new WeakMap<MarkdownTheme, T>();
  return (theme) => {
    const cached = cache.get(theme);
    if (cached) return cached;

    const styles = create(theme);
    cache.set(theme, styles);
    return styles;
  };
}
