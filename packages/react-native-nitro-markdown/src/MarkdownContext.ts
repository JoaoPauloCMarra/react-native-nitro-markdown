import { createContext, useContext, ReactNode } from "react";
import { defaultMarkdownTheme, type MarkdownTheme } from "./theme";
import type { MarkdownNode } from "./headless";

export interface CustomRendererProps {
  node: MarkdownNode;
  children: ReactNode;
  Renderer: React.ComponentType<NodeRendererProps>;
}

export type CustomRenderer = (
  props: CustomRendererProps
) => ReactNode | undefined;

export type CustomRenderers = Partial<
  Record<MarkdownNode["type"], CustomRenderer>
>;

export interface MarkdownContextValue {
  renderers: CustomRenderers;
  theme: MarkdownTheme;
}

export const MarkdownContext = createContext<MarkdownContextValue>({
  renderers: {},
  theme: defaultMarkdownTheme,
});

export const useMarkdownContext = () => useContext(MarkdownContext);

export interface NodeRendererProps {
  node: MarkdownNode;
  depth: number;
  inListItem: boolean;
  parentIsText?: boolean;
}
