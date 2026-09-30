import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import { createMarkdownSession } from "./MarkdownSession";
import {
  createTimestampTimeline,
  resolveHighlightPosition,
  type TimestampTimeline,
} from "./utils/stream-timeline";

export type MarkdownSession = ReturnType<typeof createMarkdownSession>;

export function useMarkdownSession(initialText?: string) {
  const sessionRef = useRef<MarkdownSession | null>(null);
  const adoptedSessionRef = useRef<MarkdownSession | null>(null);
  const initialTextRef = useRef(initialText);
  if (sessionRef.current === null) {
    sessionRef.current = createMarkdownSession(initialText);
  }

  const [isStreaming, setIsStreaming] = useState(false);
  const [sessionGeneration, setSessionGeneration] = useState(0);

  const getSession = useCallback((): MarkdownSession => {
    if (sessionRef.current === null) {
      sessionRef.current = createMarkdownSession(initialTextRef.current);
    }
    return sessionRef.current;
  }, []);

  useEffect(() => {
    const session = getSession();
    const previousSession = adoptedSessionRef.current;
    adoptedSessionRef.current = session;
    if (previousSession !== null && previousSession !== session) {
      setSessionGeneration((generation) => generation + 1);
    }
    return () => {
      if (sessionRef.current === session) {
        sessionRef.current = null;
      }
      session.dispose();
    };
  }, [getSession]);

  useEffect(() => {
    if (initialText === undefined || initialTextRef.current === initialText) {
      return;
    }

    initialTextRef.current = initialText;
    getSession().reset(initialText);
  }, [getSession, initialText]);

  const stop = useCallback(() => {
    setIsStreaming(false);
  }, []);

  const clear = useCallback(() => {
    stop();
    const session = getSession();
    session.clear();
    session.highlightPosition = 0;
  }, [getSession, stop]);

  const setHighlight = useCallback(
    (position: number) => {
      getSession().highlightPosition = position;
    },
    [getSession],
  );

  const reset = useCallback(
    (text: string) => {
      getSession().reset(text);
    },
    [getSession],
  );

  const replace = useCallback(
    (from: number, to: number, text: string) =>
      getSession().replace(from, to, text),
    [getSession],
  );

  return useMemo(
    () => ({
      getSession,
      isStreaming,
      setIsStreaming,
      stop,
      clear,
      setHighlight,
      reset,
      replace,
      sessionGeneration,
    }),
    [
      clear,
      getSession,
      isStreaming,
      replace,
      reset,
      sessionGeneration,
      setHighlight,
      setIsStreaming,
      stop,
    ],
  );
}

export type MarkdownSessionController = ReturnType<typeof useMarkdownSession>;

export function isMarkdownSessionController(
  value: MarkdownSession | MarkdownSessionController,
): value is MarkdownSessionController {
  return typeof Reflect.get(value, "getSession") === "function";
}

export function resolveMarkdownSession(
  session: MarkdownSession | MarkdownSessionController,
): MarkdownSession {
  if (isMarkdownSessionController(session)) {
    return session.getSession();
  }

  return session;
}

export function useStream(timestamps?: Record<number, number>) {
  const engine = useMarkdownSession();
  const { setHighlight } = engine;
  const [isPlaying, setIsPlaying] = useState(false);
  const timelineRef = useRef<TimestampTimeline>({
    entries: [],
    monotonic: true,
  });
  const lastHighlightRef = useRef<number>(-1);

  useEffect(() => {
    timelineRef.current = createTimestampTimeline(timestamps);
    lastHighlightRef.current = -1;
  }, [timestamps]);

  const sync = useCallback(
    (currentTimeMs: number) => {
      if (!timestamps) return;

      const nextHighlight = resolveHighlightPosition(
        timelineRef.current,
        currentTimeMs,
      );
      if (nextHighlight === lastHighlightRef.current) return;

      lastHighlightRef.current = nextHighlight;
      setHighlight(nextHighlight);
    },
    [setHighlight, timestamps],
  );

  return {
    ...engine,
    isPlaying,
    setIsPlaying,
    sync,
  };
}
