import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type FC,
  type ReactElement,
} from "react";
import {
  View,
  Text,
  FlatList,
  Platform,
  type ListRenderItemInfo,
  type FlatListProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  getFlattenedText,
  type MarkdownNode,
} from "./headless";
import type { ParserOptions } from "./Markdown.nitro";
import {
  MarkdownContext,
  type CustomRenderers,
  type LinkPressHandler,
  type MarkdownContextValue,
  type TableOptions,
} from "./MarkdownContext";
import { NodeRenderer, getBaseStyles } from "./node-renderer";
import {
  defaultMarkdownTheme,
  minimalMarkdownTheme,
  mergeThemes,
  type PartialMarkdownTheme,
  type NodeStyleOverrides,
  type StylingStrategy,
} from "./theme";
import type { CodeHighlighter } from "./utils/code-highlight";
import type { UrlSafetyOptions } from "./utils/link-security";
import {
  applyAfterParsePlugins,
  applyBeforeParsePlugins,
  cloneMarkdownNode,
  getParserOptionsKey,
  hashString,
  materializeMarkdownNode,
  normalizeParserOptions,
  parseWithNativeParser,
  parseWithNativeParserForRender,
  safeOnError,
  sortPluginsByPriority,
  warnInDev,
  ERROR_PHASE,
  type MarkdownErrorPhase,
} from "./utils/parse-pipeline";
import { reuseStableAstNodes } from "./utils/incremental-ast";

export type { MarkdownErrorPhase } from "./utils/parse-pipeline";

type ParseAstCacheEntry = {
  text: string;
  ast: MarkdownNode;
};

const MAX_PARSE_CACHE_ENTRIES = 32;
const MAX_CACHEABLE_TEXT_LENGTH = 24_000;
const EMPTY_RENDERERS: CustomRenderers = {};

export type ParseCacheStats = {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
};

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
   * The callback receives an isolated AST. It is mutable by default and frozen
   * when `options.freezeAst` is true.
   */
  afterParse?: AstTransform;
};

export type MarkdownParseCompleteResult = {
  raw: string;
  ast: MarkdownNode;
  text: string;
  /**
   * Per-instance parse cache counters for the current parse cycle.
   */
  cacheStats?: ParseCacheStats;
};

const getCachedParsedAst = (
  text: string,
  options: ParserOptions | undefined,
  cache: Map<string, ParseAstCacheEntry>,
  stats: { hits: number; misses: number; evictions: number },
  freezeAst: boolean,
  parse: typeof parseWithNativeParser = parseWithNativeParser,
  cloneAst = true,
): MarkdownNode => {
  if (text.length > MAX_CACHEABLE_TEXT_LENGTH) {
    return parse(text, options);
  }

  const cacheKey = `${getParserOptionsKey(options)}|${text.length}|${hashString(text)}`;
  const cachedEntry = cache.get(cacheKey);
  if (cachedEntry?.text === text) {
    stats.hits += 1;
    cache.delete(cacheKey);
    cache.set(cacheKey, cachedEntry);
    return cloneAst
      ? materializeMarkdownNode(cachedEntry.ast, freezeAst)
      : cachedEntry.ast;
  }

  stats.misses += 1;
  const parsedNode = parse(text, options);
  cache.set(cacheKey, {
    text,
    ast: cloneAst ? materializeMarkdownNode(parsedNode, true) : parsedNode,
  });
  if (cache.size > MAX_PARSE_CACHE_ENTRIES) {
    const oldestCacheKey = cache.keys().next().value;
    if (typeof oldestCacheKey === "string") {
      cache.delete(oldestCacheKey);
      stats.evictions += 1;
    }
  }

  return cloneAst ? materializeMarkdownNode(parsedNode, freezeAst) : parsedNode;
};

export type MarkdownProps = {
  /**
   * The markdown string to parse and render.
   */
  children: string;
  /**
   * Parser options to enable GFM, math, or raw HTML AST support.
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
   * Enables internal parse AST cache keyed by parser options and markdown.
   * Disable to force native parse on each parse cycle.
   * @default true
   */
  parseCache?: boolean;
  /**
   * Optional transform applied after parsing and before rendering.
   * The transformed AST is also returned in `onParseComplete`.
   * The callback receives an isolated AST. It is mutable by default and frozen
   * when `options.freezeAst` is true.
   */
  astTransform?: AstTransform;
  /**
   * Deprecated callback retained for source compatibility. It fires in the
   * effect phase after the current AST has rendered; use `onParseComplete` for
   * completed parse data or `MarkdownStream` for asynchronous parse state.
   */
  onParsingInProgress?: () => void;
  /**
   * Callback fired when parsing completes.
   */
  onParseComplete?: (result: MarkdownParseCompleteResult) => void;
  /**
   * Called when a parse error or plugin error occurs.
   * @param error - The thrown error.
   * @param phase - Where the error occurred.
   * @param pluginName - The plugin name, if applicable.
   */
  onError?: (
    error: Error,
    phase: MarkdownErrorPhase,
    pluginName?: string,
  ) => void;
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
  tableOptions?: TableOptions;
  imageOptions?: UrlSafetyOptions;
  /**
   * Enable built-in syntax highlighting for code blocks.
   * Pass `true` to use the built-in tokenizer, or a custom highlighter function.
   */
  highlightCode?: boolean | CodeHighlighter;
  /**
   * Localized text shown when parsing fails.
   * @default "Error parsing markdown"
   */
  errorText?: string;
};

export const Markdown: FC<MarkdownProps> = ({
  children,
  options,
  plugins,
  sourceAst,
  parseCache = true,
  astTransform,
  renderers = EMPTY_RENDERERS,
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
  imageOptions,
  highlightCode,
  errorText = "Error parsing markdown",
}) => {
  const parserOptionGfm = options?.gfm;
  const parserOptionMath = options?.math;
  const parserOptionHtml = options?.html;
  const parserOptionSourceOffsets = options?.sourceOffsets;
  const parserOptionMaxInputLength = options?.maxInputLength;
  const parserOptionFreezeAst = options?.freezeAst;

  /* eslint-disable react-hooks/refs -- Refs updated/read intentionally to avoid re-parsing on callback identity changes */
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const parseAstCacheRef = useRef<Map<string, ParseAstCacheEntry> | null>(null);
  const validatedSourceAstRef = useRef<MarkdownNode | null>(null);
  const cacheStatsRef = useRef({ hits: 0, misses: 0, evictions: 0 });
  if (parseAstCacheRef.current === null) {
    parseAstCacheRef.current = new Map();
    cacheStatsRef.current = { hits: 0, misses: 0, evictions: 0 };
  }

  const parseResult = useMemo(() => {
    try {
      let safeSourceAst: MarkdownNode | undefined;
      if (sourceAst) {
        const clonedSourceAst = cloneMarkdownNode(sourceAst);
        const previousSourceAst = validatedSourceAstRef.current;
        safeSourceAst = previousSourceAst
          ? reuseStableAstNodes(previousSourceAst, clonedSourceAst)
          : clonedSourceAst;
        validatedSourceAstRef.current = safeSourceAst;
      } else {
        validatedSourceAstRef.current = null;
      }
      const sortedPlugins = sortPluginsByPriority(plugins);
      const hasAstTransforms =
        Boolean(astTransform) ||
        sortedPlugins?.some((plugin) => plugin.afterParse) === true;
      const canUseRenderFastPath =
        !safeSourceAst &&
        !astTransform &&
        !onParseComplete &&
        !hasAstTransforms &&
        (!plugins || plugins.length === 0) &&
        renderers === EMPTY_RENDERERS &&
        parserOptionFreezeAst !== true;
      const canOmitRenderOffsets =
        canUseRenderFastPath &&
        parserOptionSourceOffsets === undefined;
      const markdownToParse = safeSourceAst
        ? children
        : applyBeforeParsePlugins(children, sortedPlugins, onErrorRef.current);
      const parserOptions = normalizeParserOptions(
        Object.assign(
          {},
          parserOptionGfm === undefined ? null : { gfm: parserOptionGfm },
          parserOptionMath === undefined ? null : { math: parserOptionMath },
          parserOptionHtml === undefined ? null : { html: parserOptionHtml },
          parserOptionSourceOffsets === undefined
            ? canOmitRenderOffsets
              ? { sourceOffsets: false }
              : null
            : { sourceOffsets: parserOptionSourceOffsets },
          parserOptionMaxInputLength === undefined
            ? null
            : { maxInputLength: parserOptionMaxInputLength },
          parserOptionFreezeAst === undefined
            ? null
            : { freezeAst: parserOptionFreezeAst },
        ),
      );
      let parsedAst = safeSourceAst
        ? safeSourceAst
        : parseCache
          ? getCachedParsedAst(
              markdownToParse,
              parserOptions,
              parseAstCacheRef.current!,
              cacheStatsRef.current,
              parserOptions?.freezeAst === true,
              canUseRenderFastPath
                ? parseWithNativeParserForRender
                : parseWithNativeParser,
              !canUseRenderFastPath,
            )
          : (canUseRenderFastPath
              ? parseWithNativeParserForRender
              : parseWithNativeParser)(markdownToParse, parserOptions);
      parsedAst = applyAfterParsePlugins(
        parsedAst,
        sortedPlugins,
        onErrorRef.current,
        parserOptions?.freezeAst === true,
      );

      let ast = parsedAst;
      if (astTransform) {
        try {
          const nextAst = astTransform(
            materializeMarkdownNode(
              parsedAst,
              parserOptions?.freezeAst === true,
            ),
          );
          ast = materializeMarkdownNode(
            nextAst,
            parserOptions?.freezeAst === true,
          );
        } catch (error) {
          warnInDev(
            "[react-native-nitro-markdown] astTransform threw; falling back to parsed AST.",
            error,
          );
          ast = parsedAst;
        }
      }

      return {
        ast:
          parserOptions?.freezeAst === true || hasAstTransforms
            ? materializeMarkdownNode(
                ast,
                parserOptions?.freezeAst === true,
              )
            : ast,
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
    parserOptionHtml,
    parserOptionSourceOffsets,
    parserOptionMaxInputLength,
    parserOptionFreezeAst,
    sourceAst,
    parseCache,
    astTransform,
    plugins,
    renderers,
    onParseComplete,
  ]);
  /* eslint-enable react-hooks/refs */

  useEffect(() => {
    onParsingInProgress?.();
  }, [
    children,
    parserOptionGfm,
    parserOptionMath,
    parserOptionHtml,
    parserOptionSourceOffsets,
    parserOptionMaxInputLength,
    parserOptionFreezeAst,
    onParsingInProgress,
  ]);

  useEffect(() => {
    if (!parseResult.ast || !onParseComplete) return;

    const cacheStats: ParseCacheStats = parseCache
      ? {
          hits: cacheStatsRef.current.hits,
          misses: cacheStatsRef.current.misses,
          evictions: cacheStatsRef.current.evictions,
          size: parseAstCacheRef.current?.size ?? 0,
        }
      : {
          hits: 0,
          misses: 0,
          evictions: 0,
          size: 0,
        };

    onParseComplete({
      raw: children,
      ast: parseResult.ast,
      text: getFlattenedText(parseResult.ast),
      ...(parseCache ? { cacheStats } : {}),
    });
  }, [children, onParseComplete, parseResult.ast, parseCache]);

  const theme = useMemo(() => {
    const base =
      stylingStrategy === "minimal"
        ? minimalMarkdownTheme
        : defaultMarkdownTheme;
    return mergeThemes(base, userTheme);
  }, [userTheme, stylingStrategy]);

  const baseStyles = getBaseStyles(theme);
  const contextValue = useMemo<MarkdownContextValue>(
    () => ({
      renderers,
      theme,
      stylingStrategy,
      ...(nodeStyles ? { styles: nodeStyles } : {}),
      ...(onLinkPress ? { onLinkPress } : {}),
      ...(tableOptions ? { tableOptions } : {}),
      ...(imageOptions ? { imageOptions } : {}),
      ...(highlightCode === undefined ? {} : { highlightCode }),
    }),
    [
      renderers,
      theme,
      nodeStyles,
      stylingStrategy,
      onLinkPress,
      tableOptions,
      imageOptions,
      highlightCode,
    ],
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
        <Text style={baseStyles.errorText}>{errorText}</Text>
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
              virtualization?.removeClippedSubviews ?? Platform.OS === "android"
            }
            bounces={false}
            alwaysBounceVertical={false}
            overScrollMode="never"
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <NodeRenderer node={parseResult.ast} depth={0} inListItem={false} />
        )}
      </View>
    </MarkdownContext.Provider>
  );
};
