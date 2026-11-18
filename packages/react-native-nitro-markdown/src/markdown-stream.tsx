import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
  useMemo,
  startTransition,
  type FC,
  type ReactNode,
} from "react";
import {
  parseMarkdownSession,
  type MarkdownNode,
} from "./headless";
import type { ParserOptions } from "./Markdown.nitro";
import { Markdown, type MarkdownPlugin, type MarkdownProps } from "./markdown";
import type {
  MarkdownSession,
  StreamViewRequest,
} from "./specs/MarkdownSession.nitro";
import {
  resolveMarkdownSession,
  type MarkdownSessionController,
} from "./use-markdown-stream";
import { getNextStreamAst } from "./utils/incremental-ast";
import { freezeMarkdownNode, markInternalAst } from "./utils/freeze-ast";
import {
  parseSessionView,
  SOURCE_VIEW,
  type StreamParse,
  type StreamViewState,
} from "./utils/stream-view";
import {
  parseWithNativeParser,
  safeOnError,
  useStableParserOptions,
  warnInDev,
} from "./utils/parse-pipeline";

type MarkdownOnError = NonNullable<MarkdownProps["onError"]>;

const normalizeOffset = (value: number): number | null => {
  if (!Number.isFinite(value)) return null;
  if (value <= 0) return 0;
  return Math.floor(value);
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

  if (pendingTo < pendingFrom || pendingTo !== session.getLength()) {
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

const canAppendInJs = (view: StreamViewState): boolean =>
  view.kind === "source" || view.appendable;

type StreamRenderState = {
  session: MarkdownSession;
  text: string;
  ast: MarkdownNode | null;
  view: StreamViewState;
  initializedBy?: {
    parseSession: (knownText?: string) => StreamParse;
    createEmptyAst: () => MarkdownNode;
    hasBeforeParsePlugins: boolean;
  };
  parseFailure?: { error: unknown };
};

export type MarkdownStreamSourceAstStatus = "available" | "disabled";

export type MarkdownStreamSourceAstDisabledReason =
  | "beforeParse-plugin"
  | "parse-error"
  | "initializing";

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
   * When to parse the initial session content.
   * - "sync" (default): parse during the first render. Large initial documents
   *   block the first frame.
   * - "async": parse after the first render so large initial content does not
   *   block first paint. Until the parse completes, `sourceAstStatus` is
   *   `"disabled"` with `sourceAstDisabledReason: "initializing"`.
   */
  initialParseMode?: "sync" | "async";
  /**
   * Set to true while text is still arriving. A block at the end that has
   * not finished arriving (a table row, an image or link line, a `$$` block,
   * an open code fence in `"hidden"` mode) is then held back instead of
   * showing as raw syntax. Set it to false when the stream ends, or the last
   * block can stay hidden. Has no effect with a `beforeParse` plugin.
   * @default false
   */
  streaming?: boolean;
  /**
   * How each kind of unfinished block shows while `streaming` is true.
   */
  streamingOptions?: StreamViewRequest;
  /**
   * Parser options used for the stream source AST.
   */
  options?: ParserOptions;
  onError?: MarkdownOnError;
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
  /**
   * True while `streaming` is on and `sourceAst` ends inside a fenced code
   * block whose closing fence has not arrived.
   */
  openCodeFence: boolean;
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
  initialParseMode = "sync",
  streaming = false,
  streamingOptions,
  options,
  onError,
  plugins,
}: UseMarkdownStreamStateOptions): MarkdownStreamState {
  const activeSession = resolveMarkdownSession(session);
  const parserOptions = useStableParserOptions(options);
  const canParseSessionNatively =
    parserOptions != null
      ? typeof activeSession.parseWithOptions === "function"
      : typeof activeSession.parse === "function";
  const hideTables = streamingOptions?.tables === "hidden";
  const hideCodeBlocks = streamingOptions?.codeBlocks === "hidden";
  const hideMedia = streamingOptions?.media === "hidden";
  const viewRequest = useMemo<StreamViewRequest | null>(() => {
    if (!streaming) return null;
    return {
      ...(hideTables ? { tables: "hidden" } : {}),
      ...(hideCodeBlocks ? { codeBlocks: "hidden" } : {}),
      ...(hideMedia ? { media: "hidden" } : {}),
    };
  }, [streaming, hideTables, hideCodeBlocks, hideMedia]);
  const parseSession = useCallback(
    (knownText?: string): StreamParse => {
      if (viewRequest) {
        return parseSessionView(activeSession, parserOptions, viewRequest);
      }
      if (canParseSessionNatively || knownText === undefined) {
        return {
          ast: parseMarkdownSession(activeSession, parserOptions),
          view: SOURCE_VIEW,
        };
      }
      return {
        ast: parseWithNativeParser(knownText, parserOptions),
        view: SOURCE_VIEW,
      };
    },
    [activeSession, canParseSessionNatively, parserOptions, viewRequest],
  );
  const createEmptyAst = useCallback((): MarkdownNode => {
    const ast: MarkdownNode = {
      type: "document",
      children: [],
    };
    return parserOptions?.freezeAst ? freezeMarkdownNode(ast) : ast;
  }, [parserOptions?.freezeAst]);
  const hasBeforeParsePlugins =
    plugins?.some((plugin) => typeof plugin.beforeParse === "function") ??
    false;
  const [initialParsePending, setInitialParsePending] = useState(
    () => initialParseMode === "async",
  );
  const [renderState, setRenderState] = useState<StreamRenderState>(() => {
    const initialText = activeSession.getAllText();
    if (initialParseMode === "async") {
      return {
        session: activeSession,
        text: initialText,
        ast: null,
        view: SOURCE_VIEW,
      };
    }
    let initialAst: MarkdownNode | null = createEmptyAst();
    let initialView = SOURCE_VIEW;
    if (!hasBeforeParsePlugins) {
      try {
        ({ ast: initialAst, view: initialView } = parseSession(initialText));
      } catch (error) {
        safeOnError(onError, error, "parse");
        initialAst = null;
      }
    }
    return {
      session: activeSession,
      text: initialText,
      ast: initialAst,
      view: initialView,
    };
  });
  if (renderState.session !== activeSession) {
    let replacementText: string | null;
    try {
      replacementText = activeSession.getAllText();
    } catch {
      replacementText = null;
    }
    if (replacementText !== null) {
      let replacementAst: MarkdownNode | null = createEmptyAst();
      let replacementView = SOURCE_VIEW;
      let parseFailure: { error: unknown } | undefined;
      if (!hasBeforeParsePlugins) {
        try {
          ({ ast: replacementAst, view: replacementView } =
            parseSession(replacementText));
        } catch (error) {
          replacementAst = null;
          parseFailure = { error };
        }
      }
      setRenderState({
        session: activeSession,
        text: replacementText,
        ast: replacementAst,
        view: replacementView,
        initializedBy: { parseSession, createEmptyAst, hasBeforeParsePlugins },
        ...(parseFailure ? { parseFailure } : {}),
      });
    }
  }
  const renderStateRef = useRef(renderState);
  const activeSessionRef = useRef(activeSession);
  const onErrorRef = useRef(onError);
  const didMountRef = useRef(false);
  const pendingUpdateRef = useRef(false);
  const pendingFromRef = useRef<number | null>(null);
  const pendingToRef = useRef<number | null>(null);
  const forceFullSyncRef = useRef(false);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const allowIncremental = incrementalParsing && !hasBeforeParsePlugins;

  useLayoutEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  useEffect(() => {
    if (renderState.session === activeSessionRef.current) {
      renderStateRef.current = renderState;
    }
  }, [renderState]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const isFirstRun = !didMountRef.current;
    didMountRef.current = true;
    if (isFirstRun && initialParseMode === "sync") {
      setInitialParsePending(false);
      return;
    }

    if (activeSessionRef.current !== activeSession) {
      return;
    }
    const resetPendingUpdates = () => {
      setInitialParsePending(false);
      pendingUpdateRef.current = false;
      pendingFromRef.current = null;
      pendingToRef.current = null;
      forceFullSyncRef.current = false;
    };
    const derivedState = renderStateRef.current;
    if (
      derivedState.session === activeSession &&
      derivedState.initializedBy?.parseSession === parseSession &&
      derivedState.initializedBy.createEmptyAst === createEmptyAst &&
      derivedState.initializedBy.hasBeforeParsePlugins === hasBeforeParsePlugins
    ) {
      resetPendingUpdates();
      renderStateRef.current = {
        session: derivedState.session,
        text: derivedState.text,
        ast: derivedState.ast,
        view: derivedState.view,
      };
      if (derivedState.parseFailure) {
        safeOnError(
          onErrorRef.current,
          derivedState.parseFailure.error,
          "parse",
        );
      }
      return;
    }
    let initialText: string;
    try {
      initialText = activeSession.getAllText();
    } catch (error) {
      warnInDev("[NitroMarkdown] Failed to read stream session:", error);
      return;
    }
    let initialAst: MarkdownNode | null = createEmptyAst();
    let initialView = SOURCE_VIEW;
    if (!hasBeforeParsePlugins) {
      try {
        ({ ast: initialAst, view: initialView } = parseSession(initialText));
      } catch (error) {
        safeOnError(onErrorRef.current, error, "parse");
        initialAst = null;
      }
    }
    resetPendingUpdates();
    const initialState = {
      session: activeSession,
      text: initialText,
      ast: initialAst,
      view: initialView,
    };
    renderStateRef.current = initialState;
    setRenderState(initialState);
  }, [
    activeSession,
    createEmptyAst,
    hasBeforeParsePlugins,
    parseSession,
    initialParseMode,
  ]);

  useEffect(() => {
    let subscriptionActive = true;
    const isCurrentSubscription = () =>
      subscriptionActive && activeSessionRef.current === activeSession;

    const flushUpdate = () => {
      if (!isCurrentSubscription()) return;
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
        if (isCurrentSubscription()) {
          warnInDev(
            "[NitroMarkdown] Failed to read stream session:",
            error,
          );
        }
        return;
      }
      if (!isCurrentSubscription()) return;
      if (latest === previousState.text) return;

      let nextAst: MarkdownNode | null;
      let nextView = previousState.view;
      const parseLatest = (): MarkdownNode => {
        const parsed = parseSession(latest);
        nextView = parsed.view;
        return parsed.ast;
      };
      try {
        if (hasBeforeParsePlugins) {
          nextAst = previousState.ast;
        } else if (previousState.ast) {
          nextAst = getNextStreamAst({
            allowIncremental:
              allowIncremental && canAppendInJs(previousState.view),
            nextText: latest,
            previousAst: previousState.ast,
            previousText: previousState.text,
            parseCurrent: parseLatest,
            ...(parserOptions ? { options: parserOptions } : {}),
          });
        } else {
          nextAst = parseLatest();
        }
      } catch (error) {
        if (isCurrentSubscription()) {
          safeOnError(onErrorRef.current, error, "parse");
        }
        return;
      }
      if (!isCurrentSubscription()) return;
      const nextState = {
        session: activeSession,
        text: latest,
        ast: nextAst,
        view: nextView,
      };
      renderStateRef.current = nextState;
      if (!mountedRef.current) return;

      const commitNextState = () => {
        if (!mountedRef.current || !isCurrentSubscription()) return;
        setRenderState((currentState) =>
          currentState.session === activeSession ? nextState : currentState,
        );
      };

      if (useTransitionUpdates) startTransition(commitNextState);
      else commitNextState();
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
        if (!mountedRef.current || !isCurrentSubscription()) return;

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
      warnInDev("[NitroMarkdown] Failed to subscribe to stream:", error);
    }

    if (pendingUpdateRef.current) {
      forceFullSyncRef.current = true;
      scheduleFlush();
    }

    return () => {
      subscriptionActive = false;
      try {
        unsubscribe?.();
      } catch (error) {
        warnInDev(
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
    parseSession,
    parserOptions,
    activeSession,
    updateIntervalMs,
    updateStrategy,
    useTransitionUpdates,
  ]);

  const stateMatchesSession = renderState.session === activeSession;
  const sourceAstAvailable =
    stateMatchesSession && !hasBeforeParsePlugins && renderState.ast !== null;
  const streamState: MarkdownStreamState = {
    text: stateMatchesSession ? renderState.text : "",
    sourceAstStatus: sourceAstAvailable ? "available" : "disabled",
    openCodeFence:
      sourceAstAvailable &&
      renderState.view.kind === "view" &&
      renderState.view.openCodeFence,
  };
  if (!stateMatchesSession) {
    streamState.sourceAstDisabledReason = "initializing";
  } else if (hasBeforeParsePlugins) {
    streamState.sourceAstDisabledReason = "beforeParse-plugin";
  } else if (renderState.ast === null && initialParsePending) {
    streamState.sourceAstDisabledReason = "initializing";
  } else if (renderState.ast === null) {
    streamState.sourceAstDisabledReason = "parse-error";
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
  initialParseMode = "sync",
  streaming = false,
  streamingOptions,
  options,
  onError,
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
    initialParseMode,
    streaming,
    ...(streamingOptions ? { streamingOptions } : {}),
    ...(onError ? { onError } : {}),
    ...(options ? { options } : {}),
    ...(plugins ? { plugins } : {}),
  });
  const markdownProps: MarkdownProps = {
    ...props,
    children: streamState.text,
  };
  if (onError) markdownProps.onError = onError;
  if (options) markdownProps.options = options;
  if (plugins) markdownProps.plugins = plugins;
  if (streamState.sourceAst) {
    markdownProps.sourceAst = markInternalAst(streamState.sourceAst);
  }

  if (renderMarkdown) {
    return renderMarkdown({
      ...streamState,
      markdownProps,
    });
  }

  if (streamState.sourceAstDisabledReason === "parse-error") {
    return null;
  }

  if (streamState.sourceAstDisabledReason === "initializing") {
    return null;
  }

  return <Markdown {...markdownProps} />;
};
