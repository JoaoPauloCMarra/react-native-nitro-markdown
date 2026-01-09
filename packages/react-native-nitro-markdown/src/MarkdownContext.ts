import { createContext, useContext, type ReactNode, type ComponentType } from "react";
import { defaultMarkdownTheme, type MarkdownTheme } from "./theme";
import type { MarkdownNode } from "./headless";

export interface NodeRendererProps {
  node: MarkdownNode;
  depth: number;
  inListItem: boolean;
  parentIsText?: boolean;
}

export interface CustomRendererProps {
  node: MarkdownNode;
  children: ReactNode;
  Renderer: ComponentType<NodeRendererProps>;
}

export type CustomRenderer = (
  props: CustomRendererProps
) => ReactNode | undefined;

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

