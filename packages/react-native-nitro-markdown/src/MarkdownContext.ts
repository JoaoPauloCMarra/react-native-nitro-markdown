import {
  createContext,
  useContext,
  type ReactNode,
  type ComponentType,
} from "react";
import {
  defaultMarkdownTheme,
  type MarkdownTheme,
  type NodeStyleOverrides,
  type StylingStrategy,
} from "./theme";
import type { MarkdownNode } from "./headless";

export interface NodeRendererProps {
  node: MarkdownNode;
  depth: number;
  inListItem: boolean;
  parentIsText?: boolean;
}

export interface BaseCustomRendererProps {
  node: MarkdownNode;
  children: ReactNode;
  Renderer: ComponentType<NodeRendererProps>;
}

export interface EnhancedRendererProps extends BaseCustomRendererProps {
  level?: 1 | 2 | 3 | 4 | 5 | 6;
  href?: string;
  title?: string;
  url?: string;
  alt?: string;
  content?: string;
  language?: string;
  ordered?: boolean;
  start?: number;
  checked?: boolean;
}

export interface HeadingRendererProps extends BaseCustomRendererProps {
  level: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface LinkRendererProps extends BaseCustomRendererProps {
  href: string;
  title?: string;
}

export interface ImageRendererProps extends BaseCustomRendererProps {
  url: string;
  alt?: string;
  title?: string;
}

export interface CodeBlockRendererProps extends BaseCustomRendererProps {
  content: string;
  language?: string;
}

export interface InlineCodeRendererProps extends BaseCustomRendererProps {
  content: string;
}

export interface ListRendererProps extends BaseCustomRendererProps {
  ordered: boolean;
  start?: number;
}

export interface TaskListItemRendererProps extends BaseCustomRendererProps {
  checked: boolean;
}

export interface CustomRendererProps extends EnhancedRendererProps {}

export type CustomRenderer = (
  props: EnhancedRendererProps
) => ReactNode | undefined;

export type CustomRenderers = Partial<
  Record<MarkdownNode["type"], CustomRenderer>
>;

export interface MarkdownContextValue {
  renderers: CustomRenderers;
  theme: MarkdownTheme;
  styles?: NodeStyleOverrides;
  stylingStrategy: StylingStrategy;
}

export const MarkdownContext = createContext<MarkdownContextValue>({
  renderers: {},
  theme: defaultMarkdownTheme,
  styles: undefined,
  stylingStrategy: "opinionated",
});

export const useMarkdownContext = () => useContext(MarkdownContext);
