import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type FC,
  Fragment,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Platform,
  type ListRenderItemInfo,
  type FlatListProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import {
  parseMarkdown,
  parseMarkdownWithOptions,
  getFlattenedText,
  getTextContent,
  type MarkdownNode,
} from "./headless";
import type { ParserOptions } from "./Markdown.nitro";
import {
  MarkdownContext,
  useMarkdownContext,
  type CustomRenderers,
  type LinkPressHandler,
  type NodeRendererProps,
} from "./MarkdownContext";
import { Blockquote } from "./renderers/blockquote";
import { CodeBlock, InlineCode } from "./renderers/code";
import { Heading } from "./renderers/heading";
import { HorizontalRule } from "./renderers/horizontal-rule";
import { Image } from "./renderers/image";
import { Link } from "./renderers/link";
import { List, ListItem, TaskListItem } from "./renderers/list";
import { MathInline, MathBlock } from "./renderers/math";
import { Paragraph } from "./renderers/paragraph";
import { TableRenderer } from "./renderers/table";
import {
  defaultMarkdownTheme,
  minimalMarkdownTheme,
  mergeThemes,
  type MarkdownTheme,
  type PartialMarkdownTheme,
  type NodeStyleOverrides,
  type StylingStrategy,
} from "./theme";
import type { CodeHighlighter } from "./utils/code-highlight";


function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit int
  }
  return hash;
}

const ERROR_PHASE = {
  PARSE: 'parse',
  BEFORE_PLUGIN: 'before-plugin',
  AFTER_PLUGIN: 'after-plugin',
} as const;

/**
 * Safely invoke the onError callback, preventing callback exceptions from
 * propagating and breaking the render cycle.
 */
function safeOnError<P extends string>(
  onError: ((error: Error, phase: P, pluginName?: string) => void) | undefined,
  error: unknown,
  phase: P,
  pluginName?: string,
): void {
  try {
    onError?.(error instanceof Error ? error : new Error(String(error)), phase, pluginName);
  } catch (callbackError) {
    if (__DEV__) {
      console.warn('[NitroMarkdown] onError callback threw an exception:', callbackError);
    }
  }
}

const baseStylesCache = new WeakMap<MarkdownTheme, BaseStyles>();
const parseAstCache = new Map<string, MarkdownNode>();
const MAX_PARSE_CACHE_ENTRIES = 32;
const MAX_CACHEABLE_TEXT_LENGTH = 24_000;

export type AstTransform = (ast: MarkdownNode) => MarkdownNode;
export type MarkdownVirtualizationOptions = Pick<
  FlatListProps<MarkdownNode>,
  | "initialNumToRender"
  | "maxToRenderPerBatch"
  | "windowSize"
  | "updateCellsBatchingPeriod"
  | "removeClippedSubviews"
>;

export type MarkdownPlugin = {
  /**
   * Optional plugin name used for diagnostics and debugging.
   */
  name?: string;
  /**
   * Optional plugin version metadata for diagnostics.
   */
  version?: string | number;
  /**
   * Execution priority. Higher values run first (default: 0).
   */
  priority?: number;
  /**
   * Optional text preprocessor executed before native parsing.
   * Should return a full markdown string.
   */
  beforeParse?: (markdown: string) => string;
  /**
   * Optional AST postprocessor executed after native parsing.
   */
  afterParse?: AstTransform;
};

const isMarkdownNode = (value: unknown): value is MarkdownNode => {
  if (typeof value !== "object" || value === null) return false;
  return typeof Reflect.get(value, "type") === "string";
};

const warnInDev = (message: string, error?: unknown): void => {
  if (typeof __DEV__ === "undefined" || !__DEV__) return;

  const runtimeConsole = Reflect.get(globalThis, "console");
  if (
    typeof runtimeConsole === "object" &&
    runtimeConsole !== null &&
    "warn" in runtimeConsole &&
    typeof runtimeConsole.warn === "function"
  ) {
    runtimeConsole.warn(message, error);
  }
};

const cloneMarkdownNode = (node: MarkdownNode): MarkdownNode => {
  return {
    ...node,
    children: node.children?.map(cloneMarkdownNode),
  };
};

const getParserOptionsKey = (options?: ParserOptions): string => {
  if (!options) return "gfm:default|math:default";

  const gfm = options.gfm === undefined ? "default" : options.gfm ? "1" : "0";
  const math =
    options.math === undefined ? "default" : options.math ? "1" : "0";
  return `gfm:${gfm}|math:${math}`;
};

const normalizeParserOptions = (
  options?: ParserOptions,
): ParserOptions | undefined => {
  if (!options) return undefined;

  const gfm = options.gfm;
  const math = options.math;

  if (gfm === undefined && math === undefined) {
    return undefined;
  }

  return {
    gfm,
    math,
  };
};

const parseWithNativeParser = (
  text: string,
  options?: ParserOptions,
): MarkdownNode => {
  if (options) {
    return parseMarkdownWithOptions(text, options);
  }
  return parseMarkdown(text);
};

const getCachedParsedAst = (
  text: string,
  options?: ParserOptions,
): MarkdownNode => {
  if (text.length > MAX_CACHEABLE_TEXT_LENGTH) {
    return parseWithNativeParser(text, options);
  }

  const cacheKey = `${getParserOptionsKey(options)}|${text.length}|${hashString(text)}`;
  const cachedNode = parseAstCache.get(cacheKey);
  if (cachedNode) {
    parseAstCache.delete(cacheKey);
    parseAstCache.set(cacheKey, cachedNode);
    return cloneMarkdownNode(cachedNode);
  }

  const parsedNode = parseWithNativeParser(text, options);
  parseAstCache.set(cacheKey, parsedNode);
  if (parseAstCache.size > MAX_PARSE_CACHE_ENTRIES) {
    const oldestCacheKey = parseAstCache.keys().next().value;
    if (typeof oldestCacheKey === "string") {
      parseAstCache.delete(oldestCacheKey);
    }
  }

  return cloneMarkdownNode(parsedNode);
};

const applyBeforeParsePlugins = (
  markdown: string,
  plugins?: MarkdownPlugin[],
  onError?: (error: Error, phase: 'before-plugin', pluginName?: string) => void,
): string => {
  if (!plugins || plugins.length === 0) {
    return markdown;
  }

  const sorted = [...plugins].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  let nextMarkdown = markdown;
  for (const plugin of sorted) {
    if (!plugin.beforeParse) continue;

    try {
      const transformed = plugin.beforeParse(nextMarkdown);
      if (typeof transformed === "string") {
        nextMarkdown = transformed;
      }
    } catch (error) {
      const pluginLabel = plugin.name ? ` (${plugin.name})` : "";
      warnInDev(
        `[react-native-nitro-markdown] plugin beforeParse${pluginLabel} threw; using previous markdown.`,
        error,
      );
      safeOnError(onError, error, ERROR_PHASE.BEFORE_PLUGIN, plugin.name);
    }
  }

  return nextMarkdown;
};

const applyAfterParsePlugins = (
  ast: MarkdownNode,
  plugins?: MarkdownPlugin[],
  onError?: (error: Error, phase: 'after-plugin', pluginName?: string) => void,
): MarkdownNode => {
  if (!plugins || plugins.length === 0) {
    return ast;
  }

  const sorted = [...plugins].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  let nextAst = ast;
  for (const plugin of sorted) {
    if (!plugin.afterParse) continue;

    try {
      const transformed = plugin.afterParse(nextAst);
      if (isMarkdownNode(transformed)) {
        nextAst = transformed;
      }
    } catch (error) {
      const pluginLabel = plugin.name ? ` (${plugin.name})` : "";
      warnInDev(
        `[react-native-nitro-markdown] plugin afterParse${pluginLabel} threw; using previous AST.`,
        error,
      );
      safeOnError(onError, error, ERROR_PHASE.AFTER_PLUGIN, plugin.name);
    }
  }

  return nextAst;
};

export type MarkdownProps = {
  /**
   * The markdown string to parse and render.
   */
  children: string;
  /**
   * Parser options to enable GFM or Math support.
   */
  options?: ParserOptions;
  /**
   * Optional parser plugins for preprocessing and AST postprocessing.
   */
  plugins?: MarkdownPlugin[];
  /**
   * Optional pre-parsed AST.
   * When provided, native parse is skipped and this tree is rendered instead.
   */
  sourceAst?: MarkdownNode;
  /**
   * Optional transform applied after parsing and before rendering.
   * The transformed AST is also returned in `onParseComplete`.
   */
  astTransform?: AstTransform;
  /**
   * Callback fired after the current parse cycle completes and the component
   * has re-rendered with new content. Because the native parser runs
   * synchronously inside `useMemo`, there is no observable "in-progress"
   * window — this callback fires in the `useEffect` commit phase, after the
   * new AST is already rendered. Use `onParseComplete` for post-parse
   * inspection of results.
   */
  onParsingInProgress?: () => void;
  /**
   * Callback fired when parsing completes.
   */
  onParseComplete?: (result: {
    raw: string;
    ast: MarkdownNode;
    text: string;
  }) => void;
  /**
   * Called when a parse error or plugin error occurs.
   * @param error - The thrown error.
   * @param phase - Where the error occurred.
   * @param pluginName - The plugin name, if applicable.
   */
  onError?: (error: Error, phase: 'parse' | 'before-plugin' | 'after-plugin', pluginName?: string) => void;
  /**
   * Custom renderers for specific markdown node types.
   * Each renderer receives { node, children, Renderer } plus type-specific props.
   */
  renderers?: CustomRenderers;
  /**
   * Custom theme tokens to override default styles.
   */
  theme?: PartialMarkdownTheme;
  /**
   * Style overrides for specific node types.
   * Applied after internal styles, allowing fine-grained customization.
   * @example
   * ```tsx
   * <Markdown styles={{ heading: { color: 'red' }, code_block: { borderRadius: 0 } }}>
   *   {content}
   * </Markdown>
   * ```
   */
  styles?: NodeStyleOverrides;
  /**
   * Styling strategy for the component.
   * - "opinionated": Balanced defaults with spacing and neutral colors (default)
   * - "minimal": Bare minimum styling for a clean slate
   */
  stylingStrategy?: StylingStrategy;
  /**
   * Optional style for the container view.
   */
  style?: StyleProp<ViewStyle>;
  /**
   * Optional link press handler.
   * Return false to prevent the default openURL behavior.
   */
  onLinkPress?: LinkPressHandler;
  /**
   * Enables top-level block virtualization for very large markdown documents.
   * Best used when Markdown is the primary scroll container on screen.
   * - `true`: always virtualize when block threshold is met
   * - `"auto"`: virtualize only when threshold is met (recommended for large docs)
   * - `false`: disable virtualization (default)
   */
  virtualize?: boolean | "auto";
  /**
   * Minimum number of top-level blocks before virtualization is activated.
   * Helps avoid FlatList overhead on small documents.
   */
  virtualizationMinBlocks?: number;
  /**
   * Optional FlatList tuning for virtualization.
   */
  virtualization?: MarkdownVirtualizationOptions;
  /**
   * Optional configuration for the table renderer.
   */
  tableOptions?: {
    minColumnWidth?: number;
    measurementStabilizeMs?: number;
  };
  /**
   * Enable built-in syntax highlighting for code blocks.
   * Pass `true` to use the built-in tokenizer, or a custom highlighter function.
   */
  highlightCode?: boolean | CodeHighlighter;
};

export const Markdown: FC<MarkdownProps> = ({
  children,
  options,
  plugins,
  sourceAst,
  astTransform,
  renderers = {},
  theme: userTheme,
  styles: nodeStyles,
  stylingStrategy = "opinionated",
  style,
  onParsingInProgress,
  onParseComplete,
  onLinkPress,
  onError,
  virtualize = false,
  virtualizationMinBlocks = 40,
  virtualization,
  tableOptions,
  highlightCode,
}) => {
  const parserOptionGfm = options?.gfm;
  const parserOptionMath = options?.math;

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const pluginsRef = useRef(plugins);
  pluginsRef.current = plugins;

  const parseResult = useMemo(() => {
    try {
      const markdownToParse = applyBeforeParsePlugins(children, pluginsRef.current, onErrorRef.current);
      const parserOptions = normalizeParserOptions({
        gfm: parserOptionGfm,
        math: parserOptionMath,
      });
      let parsedAst = sourceAst
        ? cloneMarkdownNode(sourceAst)
        : getCachedParsedAst(markdownToParse, parserOptions);
      parsedAst = applyAfterParsePlugins(parsedAst, pluginsRef.current, onErrorRef.current);

      let ast = parsedAst;
      if (astTransform) {
        try {
          const nextAst = astTransform(parsedAst);
          if (isMarkdownNode(nextAst)) {
            ast = nextAst;
          }
        } catch (error) {
          warnInDev(
            "[react-native-nitro-markdown] astTransform threw; falling back to parsed AST.",
            error,
          );
          ast = parsedAst;
        }
      }

      return {
        ast,
      };
    } catch (parseError) {
      safeOnError(onErrorRef.current, parseError, ERROR_PHASE.PARSE);
      return {
        ast: null,
      };
    }
  }, [
    children,
    parserOptionGfm,
    parserOptionMath,
    sourceAst,
    astTransform,
  ]);

  useEffect(() => {
    onParsingInProgress?.();
  }, [
    children,
    parserOptionGfm,
    parserOptionMath,
    onParsingInProgress,
  ]);

  useEffect(() => {
    if (!parseResult.ast || !onParseComplete) return;

    onParseComplete({
      raw: children,
      ast: parseResult.ast,
      text: getFlattenedText(parseResult.ast),
    });
  }, [children, onParseComplete, parseResult.ast]);

  const theme = useMemo(() => {
    const base =
      stylingStrategy === "minimal"
        ? minimalMarkdownTheme
        : defaultMarkdownTheme;
    return mergeThemes(base, userTheme);
  }, [userTheme, stylingStrategy]);

  const baseStyles = getBaseStyles(theme);
  const contextValue = useMemo(
    () => ({
      renderers,
      theme,
      styles: nodeStyles,
      stylingStrategy,
      onLinkPress,
      tableOptions,
      highlightCode,
    }),
    [renderers, theme, nodeStyles, stylingStrategy, onLinkPress, tableOptions, highlightCode],
  );

  const topLevelBlocks =
    parseResult.ast?.type === "document"
      ? (parseResult.ast.children ?? [])
      : parseResult.ast
        ? [parseResult.ast]
        : [];
  const shouldVirtualizeBySetting =
    virtualize === true ||
    (virtualize === "auto" && topLevelBlocks.length >= virtualizationMinBlocks);
  const shouldVirtualize =
    parseResult.ast !== null && shouldVirtualizeBySetting;

  const keyExtractor = useCallback((node: MarkdownNode, index: number) => {
    const beg = typeof node.beg === "number" ? node.beg : index;
    const end = typeof node.end === "number" ? node.end : index;
    return `${node.type}:${beg}:${end}:${index}`;
  }, []);

  const renderVirtualizedItem = useCallback(
    ({ item }: ListRenderItemInfo<MarkdownNode>): ReactElement => (
      <NodeRenderer node={item} depth={0} inListItem={false} />
    ),
    [],
  );

  if (!parseResult.ast) {
    return (
      <View style={[baseStyles.container, style]}>
        <Text style={baseStyles.errorText}>Error parsing markdown</Text>
      </View>
    );
  }

  return (
    <MarkdownContext.Provider value={contextValue}>
      <View style={[baseStyles.container, style]}>
        {shouldVirtualize ? (
          <FlatList
            data={topLevelBlocks}
            renderItem={renderVirtualizedItem}
            keyExtractor={keyExtractor}
            style={baseStyles.virtualizedList}
            initialNumToRender={virtualization?.initialNumToRender ?? 12}
            maxToRenderPerBatch={virtualization?.maxToRenderPerBatch ?? 12}
            windowSize={virtualization?.windowSize ?? 10}
            updateCellsBatchingPeriod={
              virtualization?.updateCellsBatchingPeriod ?? 16
            }
            removeClippedSubviews={
              virtualization?.removeClippedSubviews ?? true
            }
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <NodeRenderer node={parseResult.ast} depth={0} inListItem={false} />
        )}
      </View>
    </MarkdownContext.Provider>
  );
};

const isInline = (type: MarkdownNode["type"]): boolean => {
  return (
    type === "text" ||
    type === "bold" ||
    type === "italic" ||
    type === "strikethrough" ||
    type === "link" ||
    type === "code_inline" ||
    type === "soft_break" ||
    type === "line_break" ||
    type === "html_inline" ||
    type === "math_inline"
  );
};

const NodeRendererComponent: FC<NodeRendererProps> = ({
  node,
  depth,
  inListItem,
  parentIsText = false,
}) => {
  const { renderers, theme, styles: nodeStyles } = useMarkdownContext();
  const baseStyles = getBaseStyles(theme);

  const renderChildren = (
    children?: MarkdownNode[],
    childInListItem = false,
    childParentIsText = false,
  ): ReactNode => {
    if (!children || children.length === 0) return null;

    const elements: ReactNode[] = [];
    let currentInlineGroup: MarkdownNode[] = [];

    const flushInlineGroup = () => {
      if (currentInlineGroup.length > 0) {
        const hasMath = currentInlineGroup.some(
          (child) => child.type === "math_inline",
        );

        if (hasMath && !childParentIsText) {
          elements.push(
            <View
              key={`inline-group-${elements.length}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
                flexShrink: 1,
              }}
            >
              {currentInlineGroup.map((n, idx) => (
                <NodeRenderer
                  key={`${n.type}-${idx}`}
                  node={n}
                  depth={depth + 1}
                  inListItem={childInListItem}
                  parentIsText={false}
                />
              ))}
            </View>,
          );
        } else {
          const Wrapper = childParentIsText ? Fragment : Text;
          const wrapperProps = childParentIsText
            ? {}
            : { style: baseStyles.text };

          elements.push(
            <Wrapper key={`inline-group-${elements.length}`} {...wrapperProps}>
              {currentInlineGroup.map((n, idx) => (
                <NodeRenderer
                  key={`${n.type}-${idx}`}
                  node={n}
                  depth={depth + 1}
                  inListItem={childInListItem}
                  parentIsText={true}
                />
              ))}
            </Wrapper>,
          );
        }
        currentInlineGroup = [];
      }
    };

    children.forEach((child, index) => {
      if (isInline(child.type)) {
        currentInlineGroup.push(child);
      } else {
        flushInlineGroup();
        elements.push(
          <NodeRenderer
            key={`${child.type}-${index}`}
            node={child}
            depth={depth + 1}
            inListItem={childInListItem}
            parentIsText={childParentIsText}
          />,
        );
      }
    });

    flushInlineGroup();
    return elements;
  };

  const customRenderer = renderers[node.type];
  if (customRenderer) {
    const childrenRendered = renderChildren(
      node.children,
      inListItem,
      parentIsText,
    );

    const baseProps = {
      node,
      children: childrenRendered,
      Renderer: NodeRenderer,
    };

    const enhancedProps = {
      ...baseProps,
      ...(node.type === "heading" && {
        level: (node.level ?? 1) as 1 | 2 | 3 | 4 | 5 | 6,
      }),
      ...(node.type === "link" && { href: node.href ?? "", title: node.title }),
      ...(node.type === "image" && {
        url: node.href ?? "",
        alt: node.alt,
        title: node.title,
      }),
      ...(node.type === "code_block" && {
        content: getTextContent(node),
        language: node.language,
      }),
      ...(node.type === "code_inline" && { content: node.content ?? "" }),
      ...(node.type === "list" && {
        ordered: node.ordered ?? false,
        start: node.start,
      }),
      ...(node.type === "task_list_item" && { checked: node.checked ?? false }),
    };

    const result = customRenderer(enhancedProps);
    if (result !== undefined) {
      return result as ReactElement | null;
    }
  }

  const nodeStyleOverride = nodeStyles?.[node.type] as
    | (ViewStyle & TextStyle)
    | undefined;

  switch (node.type) {
    case "document":
      return (
        <View style={[baseStyles.document, nodeStyleOverride]}>
          {renderChildren(node.children, false, false)}
        </View>
      );

    case "heading":
      return (
        <Heading level={node.level ?? 1} style={nodeStyleOverride}>
          {renderChildren(node.children, inListItem, true)}
        </Heading>
      );

    case "paragraph":
      return (
        <Paragraph inListItem={inListItem} style={nodeStyleOverride}>
          {renderChildren(node.children, inListItem, false)}
        </Paragraph>
      );

    case "text":
      if (parentIsText) {
        return <Text>{node.content}</Text>;
      }
      return (
        <Text style={[baseStyles.text, nodeStyleOverride]}>{node.content}</Text>
      );

    case "bold":
      return (
        <Text style={[baseStyles.bold, nodeStyleOverride]}>
          {renderChildren(node.children, inListItem, true)}
        </Text>
      );

    case "italic":
      return (
        <Text style={[baseStyles.italic, nodeStyleOverride]}>
          {renderChildren(node.children, inListItem, true)}
        </Text>
      );

    case "strikethrough":
      return (
        <Text style={[baseStyles.strikethrough, nodeStyleOverride]}>
          {renderChildren(node.children, inListItem, true)}
        </Text>
      );

    case "link":
      return (
        <Link href={node.href ?? ""} style={nodeStyleOverride}>
          {renderChildren(node.children, inListItem, true)}
        </Link>
      );

    case "image":
      return (
        <Image
          url={node.href ?? ""}
          title={node.title}
          alt={node.alt}
          Renderer={NodeRenderer}
          style={nodeStyleOverride}
        />
      );

    case "code_inline":
      return <InlineCode style={nodeStyleOverride}>{node.content}</InlineCode>;

    case "code_block":
      return (
        <CodeBlock
          language={node.language}
          content={getTextContent(node)}
          style={nodeStyleOverride}
        />
      );

    case "blockquote":
      return (
        <Blockquote style={nodeStyleOverride}>
          {renderChildren(node.children, inListItem, false)}
        </Blockquote>
      );

    case "horizontal_rule":
      return <HorizontalRule style={nodeStyleOverride} />;

    case "line_break":
      return <Text>{"\n"}</Text>;

    case "soft_break":
      return <Text> </Text>;

    case "math_inline": {
      let mathContent = getTextContent(node);
      if (!mathContent) return null;
      mathContent = mathContent.replace(/^\$+|\$+$/g, "").trim();
      return <MathInline content={mathContent} style={nodeStyleOverride} />;
    }

    case "math_block":
      return (
        <MathBlock content={getTextContent(node)} style={nodeStyleOverride} />
      );

    case "list":
      return (
        <List
          ordered={node.ordered ?? false}
          start={node.start}
          depth={depth}
          style={nodeStyleOverride}
        >
          {node.children?.map((child, index) => {
            if (child.type === "task_list_item") {
              return (
                <NodeRenderer
                  key={index}
                  node={child}
                  depth={depth + 1}
                  inListItem={true}
                  parentIsText={false}
                />
              );
            }
            return (
              <ListItem
                key={index}
                index={index}
                ordered={node.ordered ?? false}
                start={node.start ?? 1}
              >
                <NodeRenderer
                  node={child}
                  depth={depth + 1}
                  inListItem={true}
                  parentIsText={false}
                />
              </ListItem>
            );
          })}
        </List>
      );

    case "list_item":
      return <>{renderChildren(node.children, true, false)}</>;

    case "task_list_item":
      return (
        <TaskListItem checked={node.checked ?? false} style={nodeStyleOverride}>
          {renderChildren(node.children, true, false)}
        </TaskListItem>
      );

    case "table":
      return (
        <TableRenderer
          node={node}
          Renderer={NodeRenderer}
          style={nodeStyleOverride}
        />
      );

    case "table_head":
    case "table_body":
    case "table_row":
    case "table_cell":
      return null;

    default:
      return null;
  }
};

const NodeRenderer = memo(NodeRendererComponent, (previousProps, nextProps) => {
  return (
    previousProps.node === nextProps.node &&
    previousProps.depth === nextProps.depth &&
    previousProps.inListItem === nextProps.inListItem &&
    previousProps.parentIsText === nextProps.parentIsText
  );
}) as FC<NodeRendererProps>;

type BaseStyles = ReturnType<typeof createBaseStyles>;

const getBaseStyles = (theme: MarkdownTheme): BaseStyles => {
  const cached = baseStylesCache.get(theme);
  if (cached) return cached;

  const created = createBaseStyles(theme);
  baseStylesCache.set(theme, created);
  return created;
};

const createBaseStyles = (theme: MarkdownTheme) =>
  StyleSheet.create({
    container: {
      flexShrink: 1,
    },
    virtualizedList: {
      flex: 1,
    },
    document: {
      flexShrink: 1,
    },
    errorText: {
      color: "#f87171",
      fontSize: 14,
      fontFamily: theme.fontFamilies.mono ?? "monospace",
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
    text: {
      color: theme.colors.text,
      fontSize: theme.fontSizes.m,
      lineHeight: theme.fontSizes.m * 1.6,
      fontFamily: theme.fontFamilies.regular,
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
    bold: {
      fontWeight: "700",
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
    italic: {
      fontStyle: "italic",
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
    strikethrough: {
      textDecorationLine: "line-through",
      ...(Platform.OS === "android" && { includeFontPadding: false }),
    },
  });
