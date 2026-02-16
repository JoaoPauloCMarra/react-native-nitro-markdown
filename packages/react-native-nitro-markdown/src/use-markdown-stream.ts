import { useRef, useCallback, useState, useEffect } from "react";
import { createMarkdownSession } from "./MarkdownSession";
import {
  createTimestampTimeline,
  resolveHighlightPosition,
  type TimestampTimeline,
} from "./utils/stream-timeline";

export type MarkdownSession = ReturnType<typeof createMarkdownSession>;

export function useMarkdownSession() {
  const sessionRef = useRef<MarkdownSession | null>(null);
  if (sessionRef.current === null) {
    sessionRef.current = createMarkdownSession();
  }

  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    const session = sessionRef.current!;
    return () => {
      session.clear();
    };
  }, []);

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

  return {
    getSession,
    isStreaming,
    setIsStreaming,
    stop,
    clear,
    setHighlight,
  };
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
