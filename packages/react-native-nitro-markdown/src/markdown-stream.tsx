import {
  useState,
  useEffect,
  useRef,
  useCallback,
  startTransition,
  type FC,
} from "react";
import type { MarkdownNode } from "./headless";
import { Markdown, type MarkdownProps } from "./markdown";
import type { MarkdownSession } from "./specs/MarkdownSession.nitro";
import { getNextStreamAst, parseMarkdownAst } from "./utils/incremental-ast";

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

  if (pendingTo < pendingFrom) {
    return session.getAllText();
  }

  if (pendingFrom === previousText.length) {
    const appendedChunk = session.getTextRange(pendingFrom, pendingTo);
    return `${previousText}${appendedChunk}`;
  }

  if (pendingFrom === 0) {
    return session.getTextRange(0, pendingTo);
  }

  return session.getAllText();
};

export type MarkdownStreamProps = {
  /**
   * The active MarkdownSession to stream content from.
   */
  session: MarkdownSession;
  /**
   * Throttle UI updates to avoid re-rendering on every token.
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
} & Omit<MarkdownProps, "children" | "sourceAst">;

/**
 * A component that renders streaming Markdown from a MarkdownSession.
 * It efficiently subscribes to session updates to minimize parent re-renders.
 */
export const MarkdownStream: FC<MarkdownStreamProps> = ({
  session,
  updateIntervalMs = 50,
  updateStrategy = "interval",
  useTransitionUpdates = false,
  incrementalParsing = true,
  options,
  plugins,
  ...props
}) => {
  const parseText = useCallback(
    (text: string): MarkdownNode => parseMarkdownAst(text, options),
    [options],
  );
  const createEmptyAst = (): MarkdownNode => ({
    type: "document",
    children: [],
  });
  const initialText = session.getAllText();
  const hasBeforeParsePlugins =
    plugins?.some((plugin) => typeof plugin.beforeParse === "function") ??
    false;
  const [renderState, setRenderState] = useState(() => ({
    text: initialText,
    ast: hasBeforeParsePlugins ? createEmptyAst() : parseText(initialText),
  }));
  const renderStateRef = useRef(renderState);
  const pendingUpdateRef = useRef(false);
  const pendingFromRef = useRef<number | null>(null);
  const pendingToRef = useRef<number | null>(null);
  const forceFullSyncRef = useRef(false);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const allowIncremental = incrementalParsing && !hasBeforeParsePlugins;

  useEffect(() => {
    renderStateRef.current = renderState;
  }, [renderState]);

  useEffect(() => {
    const initialText = session.getAllText();
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
  }, [hasBeforeParsePlugins, parseText, session]);

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

      const latest = resolveStreamText({
        forceFullSync,
        pendingFrom,
        pendingTo,
        previousText: previousState.text,
        session,
      });
      if (latest === previousState.text) return;

      const nextAst = hasBeforeParsePlugins
        ? previousState.ast
        : getNextStreamAst({
            allowIncremental,
            nextText: latest,
            options,
            previousAst: previousState.ast,
            previousText: previousState.text,
          });
      const nextState = {
        text: latest,
        ast: nextAst,
      };
      renderStateRef.current = nextState;

      if (useTransitionUpdates) {
        startTransition(() => {
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

    const unsubscribe = session.addListener((from, to) => {
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

    return () => {
      unsubscribe();
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
    options,
    session,
    updateIntervalMs,
    updateStrategy,
    useTransitionUpdates,
  ]);

  return (
    <Markdown
      {...props}
      options={options}
      plugins={plugins}
      sourceAst={hasBeforeParsePlugins ? undefined : renderState.ast}
    >
      {renderState.text}
    </Markdown>
  );
};
