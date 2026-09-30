import type { FC } from "react";
import type { ViewStyle } from "react-native";
import { RaTeXView } from "ratex-react-native";
import {
  useMarkdownContext,
  type CustomRenderers,
  type MathRendererProps,
} from "./MarkdownContext";
import {
  MathBlock,
  MathInline,
  normalizeInlineMathContent,
  type LatexViewComponent,
} from "./renderers/math";

export type { LatexViewComponent, LatexViewProps } from "./renderers/math";

const RaTeXLatexView = RaTeXView as LatexViewComponent;

export type RaTeXMathProps = {
  content?: string;
  style?: ViewStyle;
};

export const RaTeXMathInline: FC<RaTeXMathProps> = ({ content, style }) => (
  <MathInline
    LatexView={RaTeXLatexView}
    {...(content === undefined
      ? {}
      : { content: normalizeInlineMathContent(content) })}
    {...(style ? { style } : {})}
  />
);

export const RaTeXMathBlock: FC<RaTeXMathProps> = ({ content, style }) => (
  <MathBlock
    LatexView={RaTeXLatexView}
    {...(content === undefined ? {} : { content })}
    {...(style ? { style } : {})}
  />
);

const ThemedMathInline: FC<{ content: string }> = ({ content }) => {
  const { styles } = useMarkdownContext();
  return (
    <RaTeXMathInline
      content={content}
      {...(styles?.math_inline ? { style: styles.math_inline } : {})}
    />
  );
};

const ThemedMathBlock: FC<{ content: string }> = ({ content }) => {
  const { styles } = useMarkdownContext();
  return (
    <RaTeXMathBlock
      content={content}
      {...(styles?.math_block ? { style: styles.math_block } : {})}
    />
  );
};

/**
 * Renderers that draw `math_inline` and `math_block` nodes with RaTeX.
 * Pass them through `renderers` (spread them into your own renderers when
 * you have custom ones). Requires `ratex-react-native` to be installed.
 */
export const mathRenderers = {
  math_inline: ({ content }: MathRendererProps) => (
    <ThemedMathInline content={content} />
  ),
  math_block: ({ content }: MathRendererProps) => (
    <ThemedMathBlock content={content} />
  ),
} satisfies CustomRenderers;
