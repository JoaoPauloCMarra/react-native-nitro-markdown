import type { MarkdownNode } from "../headless";
import { parseMarkdown, parseMarkdownWithOptions } from "../headless";
import type { ParserOptions } from "../Markdown.nitro";
import type { MarkdownPlugin } from "../markdown";

export type MarkdownErrorPhase = "parse" | "before-plugin" | "after-plugin";

export const ERROR_PHASE = {
  PARSE: "parse",
  BEFORE_PLUGIN: "before-plugin",
  AFTER_PLUGIN: "after-plugin",
} as const;

export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit int
  }
  return hash;
}

/**
 * Safely invoke the onError callback, preventing callback exceptions from
 * propagating and breaking the render cycle.
 */
export function safeOnError<P extends string>(
  onError: ((error: Error, phase: P, pluginName?: string) => void) | undefined,
  error: unknown,
  phase: P,
  pluginName?: string,
): void {
  try {
    onError?.(
      error instanceof Error ? error : new Error(String(error)),
      phase,
      pluginName,
    );
  } catch (callbackError) {
    if (__DEV__) {
      console.warn(
        "[NitroMarkdown] onError callback threw an exception:",
        callbackError,
      );
    }
  }
}

export const isMarkdownNode = (value: unknown): value is MarkdownNode => {
  if (typeof value !== "object" || value === null) return false;
  return typeof Reflect.get(value, "type") === "string";
};

export const warnInDev = (message: string, error?: unknown): void => {
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

export const cloneMarkdownNode = (node: MarkdownNode): MarkdownNode => {
  const children = node.children?.map(cloneMarkdownNode);
  return children ? { ...node, children } : { ...node };
};

export const getParserOptionsKey = (options?: ParserOptions): string => {
  if (!options) {
    return "gfm:default|math:default|html:default|sourceOffsets:default|maxInputLength:default";
  }

  const gfm = options.gfm === undefined ? "default" : options.gfm ? "1" : "0";
  const math =
    options.math === undefined ? "default" : options.math ? "1" : "0";
  const html =
    options.html === undefined ? "default" : options.html ? "1" : "0";
  const sourceOffsets =
    options.sourceOffsets === undefined
      ? "default"
      : options.sourceOffsets
        ? "1"
        : "0";
  const maxInputLength =
    options.maxInputLength === undefined
      ? "default"
      : String(options.maxInputLength);
  return `gfm:${gfm}|math:${math}|html:${html}|sourceOffsets:${sourceOffsets}|maxInputLength:${maxInputLength}`;
};

export const normalizeParserOptions = (
  options?: ParserOptions,
): ParserOptions | undefined => {
  if (!options) return undefined;

  const gfm = options.gfm;
  const math = options.math;
  const html = options.html;
  const sourceOffsets = options.sourceOffsets;
  const maxInputLength = options.maxInputLength;

  if (
    gfm === undefined &&
    math === undefined &&
    html === undefined &&
    sourceOffsets === undefined &&
    maxInputLength === undefined
  ) {
    return undefined;
  }

  const normalized: ParserOptions = {};
  if (gfm !== undefined) normalized.gfm = gfm;
  if (math !== undefined) normalized.math = math;
  if (html !== undefined) normalized.html = html;
  if (sourceOffsets !== undefined) {
    normalized.sourceOffsets = sourceOffsets;
  }
  if (maxInputLength !== undefined) {
    normalized.maxInputLength = maxInputLength;
  }
  return normalized;
};

export const parseWithNativeParser = (
  text: string,
  options?: ParserOptions,
): MarkdownNode => {
  if (options) {
    return parseMarkdownWithOptions(text, options);
  }
  return parseMarkdown(text);
};

export const sortPluginsByPriority = (
  plugins?: MarkdownPlugin[],
): MarkdownPlugin[] | undefined => {
  if (!plugins || plugins.length === 0) {
    return undefined;
  }

  return [...plugins].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
};

export const applyBeforeParsePlugins = (
  markdown: string,
  sortedPlugins?: MarkdownPlugin[],
  onError?: (error: Error, phase: "before-plugin", pluginName?: string) => void,
): string => {
  if (!sortedPlugins || sortedPlugins.length === 0) {
    return markdown;
  }

  let nextMarkdown = markdown;
  for (const plugin of sortedPlugins) {
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

export const applyAfterParsePlugins = (
  ast: MarkdownNode,
  sortedPlugins?: MarkdownPlugin[],
  onError?: (error: Error, phase: "after-plugin", pluginName?: string) => void,
): MarkdownNode => {
  if (!sortedPlugins || sortedPlugins.length === 0) {
    return ast;
  }

  let nextAst = ast;
  for (const plugin of sortedPlugins) {
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
