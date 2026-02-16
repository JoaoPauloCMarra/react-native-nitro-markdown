import { useState, useEffect, useRef, startTransition, type FC } from "react";
import { Markdown, type MarkdownProps } from "./markdown";
import type { MarkdownSession } from "./specs/MarkdownSession.nitro";

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
} & Omit<MarkdownProps, "children">;

/**
 * A component that renders streaming Markdown from a MarkdownSession.
 * It efficiently subscribes to session updates to minimize parent re-renders.
 */
export const MarkdownStream: FC<MarkdownStreamProps> = ({
  session,
  updateIntervalMs = 50,
  updateStrategy = "interval",
  useTransitionUpdates = false,
  ...props
}) => {
  const [text, setText] = useState(() => session.getAllText());
  const pendingUpdateRef = useRef(false);
  const updateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastEmittedRef = useRef(text);

  useEffect(() => {
    // Ensure initial state is synced
    const initialText = session.getAllText();
    setText(initialText);
    lastEmittedRef.current = initialText;

    const flushUpdate = () => {
      updateTimerRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (!pendingUpdateRef.current) return;
      pendingUpdateRef.current = false;

      const latest = session.getAllText();
      if (latest === lastEmittedRef.current) return;
      lastEmittedRef.current = latest;

      if (useTransitionUpdates) {
        startTransition(() => {
          setText(latest);
        });
      } else {
        setText(latest);
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

    const unsubscribe = session.addListener(() => {
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
  }, [session, updateIntervalMs, updateStrategy, useTransitionUpdates]);

  return <Markdown {...props}>{text}</Markdown>;
};
