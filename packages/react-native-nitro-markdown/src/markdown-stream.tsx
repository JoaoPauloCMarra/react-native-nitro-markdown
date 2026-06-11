import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  startTransition,
  type FC,
  type ReactNode,
} from "react";
import type { MarkdownNode } from "./headless";
import type { ParserOptions } from "./Markdown.nitro";
import { Markdown, type MarkdownPlugin, type MarkdownProps } from "./markdown";
import type { MarkdownSession } from "./specs/MarkdownSession.nitro";
import {
  resolveMarkdownSession,
  type MarkdownSessionController,
} from "./use-markdown-stream";
import { getNextStreamAst, parseMarkdownAst } from "./utils/incremental-ast";

const normalizeOffset = (value: number): number | null => {
  if (!Number.isFinite(value)) return null;
  if (value <= 0) return 0;
  return Math.floor(value);
};

const normalizeParserOptions = (
  options?: ParserOptions,
): ParserOptions | undefined => {
  if (!options) return undefined;

  const gfm = options.gfm;
  const math = options.math;
  const html = options.html;

  if (gfm === undefined && math === undefined && html === undefined) {
    return undefined;
  }

  const normalized: ParserOptions = {};
  if (gfm !== undefined) normalized.gfm = gfm;
  if (math !== undefined) normalized.math = math;
  if (html !== undefined) normalized.html = html;
  return normalized;
};

const resolveStreamText = ({
  forceFullSync,
  pendingFrom,
  pendingTo,
  previousText,
  session,
}: {
  forceFullSync: boolean;
  pendingFrom: number | null;
  pendingTo: number | null;
  previousText: string;
  session: MarkdownSession;
}): string => {
  if (forceFullSync || pendingFrom === null || pendingTo === null) {
    return session.getAllText();
  }

  if (pendingTo < pendingFrom) {
    return session.getAllText();
  }

  if (pendingFrom === previousText.length) {
    try {
      const appendedChunk = session.getTextRange(pendingFrom, pendingTo);
      return `${previousText}${appendedChunk}`;
    } catch {
      return session.getAllText();
    }
  }

  if (pendingFrom === 0) {
    try {
      return session.getTextRange(0, pendingTo);
    } catch {
      return session.getAllText();
    }
  }

  return session.getAllText();
};

function warnStreamError(message: string, error: unknown): void {
  if (!__DEV__) return;

  const warn = Reflect.get(console, "warn");
  if (typeof warn === "function") {
    warn.call(console, message, error);
  }
}

export type MarkdownStreamSourceAstStatus = "available" | "disabled";

export type MarkdownStreamSourceAstDisabledReason = "beforeParse-plugin";

export type UseMarkdownStreamStateOptions = {
  /**
   * The active MarkdownSession to stream content from.
   */
  session: MarkdownSession | MarkdownSessionController;
  /**
   * Throttle UI updates when updateStrategy is "interval".
   * Ignored when updateStrategy is "raf".
   * Defaults to 50ms, which keeps UI responsive while streaming.
   */
  updateIntervalMs?: number;
  /**
   * Update strategy for streaming renders.
   * - "interval": throttle to a fixed interval (default)
   * - "raf": update at most once per animation frame
   */
  updateStrategy?: "interval" | "raf";
  /**
   * Use React transitions for streaming updates.
   * Useful when you want to prioritize user interactions over stream renders.
   */
  useTransitionUpdates?: boolean;
  /**
   * Enable incremental AST updates for append-only streams.
   * Automatically falls back to full parse when updates are not safely mergeable.
   */
  incrementalParsing?: boolean;
  /**
   * Parser options used for the stream source AST.
   */
  options?: ParserOptions;
  /**
   * Plugins determine whether an optimized source AST can be passed through.
   */
  plugins?: MarkdownPlugin[];
};

export type MarkdownStreamState = {
  text: string;
  sourceAst?: MarkdownNode;
  sourceAstStatus: MarkdownStreamSourceAstStatus;
  sourceAstDisabledReason?: MarkdownStreamSourceAstDisabledReason;
};

export type MarkdownStreamRenderProps = MarkdownStreamState & {
  markdownProps: MarkdownProps;
};

export type MarkdownStreamProps = UseMarkdownStreamStateOptions & {
  renderMarkdown?: (props: MarkdownStreamRenderProps) => ReactNode;
} & Omit<MarkdownProps, "children" | "sourceAst">;

export function useMarkdownStreamState({
  session,
  updateIntervalMs = 50,
  updateStrategy = "interval",
  useTransitionUpdates = false,
  incrementalParsing = true,
  options,
  plugins,
}: UseMarkdownStreamStateOptions): MarkdownStreamState {
  const activeSession = resolveMarkdownSession(session);
  const parserOptionGfm = options?.gfm;
  const parserOptionMath = options?.math;
  const parserOptionHtml = options?.html;
  const parserOptions = useMemo(
    () =>
      normalizeParserOptions(
        Object.assign(
          {},
          parserOptionGfm === undefined ? null : { gfm: parserOptionGfm },
          parserOptionMath === undefined ? null : { math: parserOptionMath },
          parserOptionHtml === undefined ? null : { html: parserOptionHtml },
        ),
      ),
    [parserOptionGfm, parserOptionMath, parserOptionHtml],
  );
  const parseText = useCallback(
    (text: string): MarkdownNode => parseMarkdownAst(text, parserOptions),
    [parserOptions],
  );
  const createEmptyAst = (): MarkdownNode => ({
    type: "document",
    children: [],
  });
  const hasBeforeParsePlugins =
    plugins?.some((plugin) => typeof plugin.beforeParse === "function") ??
    false;
  const [renderState, setRenderState] = useState(() => {
    const initialText = activeSession.getAllText();
    return {
      text: initialText,
      ast: hasBeforeParsePlugins ? createEmptyAst() : parseText(initialText),
    };
  });
  const renderStateRef = useRef(renderState);
  const didMountRef = useRef(false);
  const pendingUpdateRef = useRef(false);
  const pendingFromRef = useRef<number | null>(null);
  const pendingToRef = useRef<number | null>(null);
  const forceFullSyncRef = useRef(false);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const allowIncremental = incrementalParsing && !hasBeforeParsePlugins;

  useEffect(() => {
    renderStateRef.current = renderState;
  }, [renderState]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    const initialText = activeSession.getAllText();
    const initialState = {
      text: initialText,
      ast: hasBeforeParsePlugins ? createEmptyAst() : parseText(initialText),
    };
    pendingUpdateRef.current = false;
    pendingFromRef.current = null;
    pendingToRef.current = null;
    forceFullSyncRef.current = false;
    renderStateRef.current = initialState;
    setRenderState(initialState);
  }, [activeSession, hasBeforeParsePlugins, parseText]);

  useEffect(() => {
    const flushUpdate = () => {
      updateTimerRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (!pendingUpdateRef.current) return;
      pendingUpdateRef.current = false;

      const previousState = renderStateRef.current;
      const pendingFrom = pendingFromRef.current;
      const pendingTo = pendingToRef.current;
      const forceFullSync = forceFullSyncRef.current;
      pendingFromRef.current = null;
      pendingToRef.current = null;
      forceFullSyncRef.current = false;

      let latest: string;
      try {
        latest = resolveStreamText({
          forceFullSync,
          pendingFrom,
          pendingTo,
          previousText: previousState.text,
          session: activeSession,
        });
      } catch (error) {
        warnStreamError("[NitroMarkdown] Failed to read stream session:", error);
        return;
      }
      if (latest === previousState.text) return;

      const nextAst = hasBeforeParsePlugins
        ? previousState.ast
        : getNextStreamAst({
            allowIncremental,
            nextText: latest,
            previousAst: previousState.ast,
            previousText: previousState.text,
            ...(parserOptions ? { options: parserOptions } : {}),
          });
      const nextState = {
        text: latest,
        ast: nextAst,
      };
      renderStateRef.current = nextState;
      if (!mountedRef.current) return;

      if (useTransitionUpdates) {
        startTransition(() => {
          if (!mountedRef.current) return;
          setRenderState(nextState);
        });
      } else {
        setRenderState(nextState);
      }
    };

    const scheduleFlush = () => {
      if (updateStrategy === "raf") {
        if (rafRef.current === null) {
          rafRef.current = requestAnimationFrame(flushUpdate);
        }
        return;
      }

      if (!updateTimerRef.current) {
        updateTimerRef.current = setTimeout(flushUpdate, updateIntervalMs);
      }
    };

    let unsubscribe: (() => void) | null = null;

    try {
      unsubscribe = activeSession.addListener((from, to) => {
        if (!mountedRef.current) return;

        const nextFrom = normalizeOffset(from);
        const nextTo = normalizeOffset(to);

        if (nextFrom === null || nextTo === null || nextTo < nextFrom) {
          forceFullSyncRef.current = true;
        } else {
          const currentFrom = pendingFromRef.current;
          const currentTo = pendingToRef.current;

          pendingFromRef.current =
            currentFrom === null ? nextFrom : Math.min(currentFrom, nextFrom);
          pendingToRef.current =
            currentTo === null ? nextTo : Math.max(currentTo, nextTo);
        }

        pendingUpdateRef.current = true;
        scheduleFlush();
      });
    } catch (error) {
      warnStreamError("[NitroMarkdown] Failed to subscribe to stream:", error);
    }

    return () => {
      pendingUpdateRef.current = false;
      pendingFromRef.current = null;
      pendingToRef.current = null;
      forceFullSyncRef.current = false;
      try {
        unsubscribe?.();
      } catch (error) {
        warnStreamError(
          "[NitroMarkdown] Failed to unsubscribe from stream:",
          error,
        );
      }
      if (updateTimerRef.current) {
        clearTimeout(updateTimerRef.current);
        updateTimerRef.current = null;
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [
    allowIncremental,
    hasBeforeParsePlugins,
    parserOptions,
    activeSession,
    updateIntervalMs,
    updateStrategy,
    useTransitionUpdates,
  ]);

  const streamState: MarkdownStreamState = {
    text: renderState.text,
    sourceAstStatus: hasBeforeParsePlugins ? "disabled" : "available",
  };
  if (hasBeforeParsePlugins) {
    streamState.sourceAstDisabledReason = "beforeParse-plugin";
  } else {
    streamState.sourceAst = renderState.ast;
  }
  return streamState;
}

export const MarkdownStream: FC<MarkdownStreamProps> = ({
  session,
  updateIntervalMs = 50,
  updateStrategy = "interval",
  useTransitionUpdates = false,
  incrementalParsing = true,
  options,
  plugins,
  renderMarkdown,
  ...props
}) => {
  const streamState = useMarkdownStreamState({
    session,
    updateIntervalMs,
    updateStrategy,
    useTransitionUpdates,
    incrementalParsing,
    ...(options ? { options } : {}),
    ...(plugins ? { plugins } : {}),
  });
  const markdownProps: MarkdownProps = {
    ...props,
    children: streamState.text,
  };
  if (options) markdownProps.options = options;
  if (plugins) markdownProps.plugins = plugins;
  if (streamState.sourceAst) markdownProps.sourceAst = streamState.sourceAst;

  if (renderMarkdown) {
    return renderMarkdown({
      ...streamState,
      markdownProps,
    });
  }

  return <Markdown {...markdownProps} />;
};
