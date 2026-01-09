import { useRef, useCallback, useState, useEffect } from "react";
import { createMarkdownSession } from "./MarkdownSession";

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
  const [isPlaying, setIsPlaying] = useState(false);

  const sortedKeys = useRef<number[]>([]);
  useEffect(() => {
    if (timestamps) {
      sortedKeys.current = Object.keys(timestamps)
        .map(Number)
        .sort((a, b) => a - b);
    }
  }, [timestamps]);

  const sync = useCallback(
    (currentTimeMs: number) => {
      if (!timestamps) return;

      let wordIdx = 0;
      for (const idx of sortedKeys.current) {
        if (currentTimeMs >= timestamps[idx]) {
          wordIdx = idx + 1;
        } else {
          break;
        }
      }
      engine.setHighlight(wordIdx);
    },
    [timestamps, engine]
  );

  return {
    ...engine,
    isPlaying,
    setIsPlaying,
    sync,
  };
}
