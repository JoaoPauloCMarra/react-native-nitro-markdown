import { createContext, useContext, ReactNode } from "react";
import { defaultMarkdownTheme, type MarkdownTheme } from "./theme";
import type { MarkdownNode } from "./headless";

export type CustomRenderer = (props: {
  node: MarkdownNode;
  children: ReactNode;
  Renderer: React.ComponentType<NodeRendererProps>;
}) => ReactNode | undefined;

/**
 * Object mapping node types to custom renderers.
 */
export type CustomRenderers = Partial<
  Record<MarkdownNode["type"], CustomRenderer>
>;

// Context for custom renderers and theme
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
