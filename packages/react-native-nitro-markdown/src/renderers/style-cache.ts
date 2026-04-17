import type { MarkdownTheme } from "../theme";

export function getCachedStyles<T>(
  cache: WeakMap<MarkdownTheme, T>,
  theme: MarkdownTheme,
  createStyles: (theme: MarkdownTheme) => T,
): T {
  const cached = cache.get(theme);
  if (cached) return cached;

  const styles = createStyles(theme);
  cache.set(theme, styles);
  return styles;
}
