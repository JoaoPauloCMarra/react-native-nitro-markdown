import {
  createContext,
  useContext,
  type ReactNode,
  type ComponentType,
} from "react";
import type { MarkdownNode } from "./headless";
import {
  defaultMarkdownTheme,
  type MarkdownTheme,
  type NodeStyleOverrides,
  type StylingStrategy,
} from "./theme";

export type NodeRendererProps = {
  node: MarkdownNode;
  depth: number;
  inListItem: boolean;
  parentIsText?: boolean;
};

export type BaseCustomRendererProps = {
  node: MarkdownNode;
  children: ReactNode;
  Renderer: ComponentType<NodeRendererProps>;
};

export type EnhancedRendererProps = {
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
} & BaseCustomRendererProps;

export type HeadingRendererProps = {
  level: 1 | 2 | 3 | 4 | 5 | 6;
} & BaseCustomRendererProps;

export type LinkRendererProps = {
  href: string;
  title?: string;
} & BaseCustomRendererProps;

export type ImageRendererProps = {
  url: string;
  alt?: string;
  title?: string;
} & BaseCustomRendererProps;

export type CodeBlockRendererProps = {
  content: string;
  language?: string;
} & BaseCustomRendererProps;

export type InlineCodeRendererProps = {
  content: string;
} & BaseCustomRendererProps;

export type ListRendererProps = {
  ordered: boolean;
  start?: number;
} & BaseCustomRendererProps;

export type TaskListItemRendererProps = {
  checked: boolean;
} & BaseCustomRendererProps;

export type CustomRendererProps = {} & EnhancedRendererProps;

export type LinkPressHandler = (
  href: string,
) => void | boolean | Promise<void | boolean>;

export type CustomRenderer = (
  props: EnhancedRendererProps,
) => ReactNode | undefined;

export type CustomRenderers = Partial<
  Record<MarkdownNode["type"], CustomRenderer>
>;

export type MarkdownContextValue = {
  renderers: CustomRenderers;
  theme: MarkdownTheme;
  styles?: NodeStyleOverrides;
  stylingStrategy: StylingStrategy;
  onLinkPress?: LinkPressHandler;
};

export const MarkdownContext = createContext<MarkdownContextValue>({
  renderers: {},
  theme: defaultMarkdownTheme,
  styles: undefined,
  stylingStrategy: "opinionated",
  onLinkPress: undefined,
});

export const useMarkdownContext = () => useContext(MarkdownContext);
