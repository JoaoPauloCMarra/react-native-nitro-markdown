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
  const initialTextRef = useRef(initialText);
  if (sessionRef.current === null) {
    sessionRef.current = createMarkdownSession(initialText);
  }

  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    const session = sessionRef.current!;
    return () => {
      try {
        session.dispose();
      } finally {
        sessionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (initialText === undefined || initialTextRef.current === initialText) {
      return;
    }

    initialTextRef.current = initialText;
    sessionRef.current!.reset(initialText);
  }, [initialText]);

  const stop = useCallback(() => {
    setIsStreaming(false);
  }, []);

  const clear = useCallback(() => {
    stop();
    sessionRef.current!.clear();
    sessionRef.current!.highlightPosition = 0;
  }, [stop]);

  const setHighlight = useCallback((position: number) => {
    sessionRef.current!.highlightPosition = position;
  }, []);

  const getSession = useCallback(() => sessionRef.current!, []);

  const reset = useCallback((text: string) => {
    sessionRef.current!.reset(text);
  }, []);

  const replace = useCallback((from: number, to: number, text: string) => {
    return sessionRef.current!.replace(from, to, text);
  }, []);

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
    }),
    [
      clear,
      getSession,
      isStreaming,
      replace,
      reset,
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
