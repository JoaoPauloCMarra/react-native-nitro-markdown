import { useMemo } from "react";
import type { MarkdownNode } from "../headless";
import {
  parseMarkdown,
  parseMarkdownWithOptions,
} from "../headless";
import type { ParserOptions } from "../Markdown.nitro";
import type { MarkdownPlugin } from "../markdown";
import { cloneMarkdownNode, freezeMarkdownNode } from "./freeze-ast";

export type MarkdownErrorPhase =
  | "parse"
  | "before-plugin"
  | "after-plugin"
  | "transform";

export const ERROR_PHASE = {
  PARSE: "parse",
  BEFORE_PLUGIN: "before-plugin",
  AFTER_PLUGIN: "after-plugin",
  TRANSFORM: "transform",
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

export const materializeMarkdownNode = (
  node: MarkdownNode,
  freezeAst = false,
): MarkdownNode => {
  const clone = cloneMarkdownNode(node);
  return freezeAst ? freezeMarkdownNode(clone) : clone;
};

const PARSER_OPTION_FLAGS: Record<keyof ParserOptions, true> = {
  gfm: true,
  math: true,
  html: true,
  sourceOffsets: true,
  maxInputLength: true,
  freezeAst: true,
};

export const PARSER_OPTION_KEYS = Object.keys(
  PARSER_OPTION_FLAGS,
) as (keyof ParserOptions)[];

const formatParserOptionValue = (value: unknown): string => {
  if (value === undefined) return "default";
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value);
};

export const getParserOptionsKey = (options?: ParserOptions): string =>
  PARSER_OPTION_KEYS.map(
    (key) => `${key}:${formatParserOptionValue(options?.[key])}`,
  ).join("|");

export const normalizeParserOptions = (
  options?: ParserOptions,
): ParserOptions | undefined => {
  if (!options) return undefined;

  const normalized: Record<string, unknown> = {};
  for (const key of PARSER_OPTION_KEYS) {
    if (options[key] !== undefined) normalized[key] = options[key];
  }
  return Object.keys(normalized).length === 0
    ? undefined
    : (normalized as ParserOptions);
};

export const useStableParserOptions = (
  options?: ParserOptions,
): ParserOptions | undefined => {
  const optionsKey = getParserOptionsKey(options);
  return useMemo(
    () => normalizeParserOptions(options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [optionsKey],
  );
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
  freezeAst = false,
): MarkdownNode => {
  if (!sortedPlugins || sortedPlugins.length === 0) {
    return ast;
  }

  let nextAst = ast;
  for (const plugin of sortedPlugins) {
    if (!plugin.afterParse) continue;

    try {
      const pluginInput = materializeMarkdownNode(nextAst, freezeAst);
      const transformed = plugin.afterParse(pluginInput);
      if (transformed !== undefined) {
        nextAst = materializeMarkdownNode(transformed, freezeAst);
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
