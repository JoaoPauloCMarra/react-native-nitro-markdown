import { useState, useEffect, type FC } from "react";
import { Markdown, type MarkdownProps } from "./markdown";
import type { MarkdownSession } from "./specs/MarkdownSession.nitro";

export interface MarkdownStreamProps extends Omit<MarkdownProps, "children"> {
  /**
   * The active MarkdownSession to stream content from.
   */
  session: MarkdownSession;
}

/**
 * A component that renders streaming Markdown from a MarkdownSession.
 * It efficiently subscribes to session updates to minimize parent re-renders.
 */
export const MarkdownStream: FC<MarkdownStreamProps> = ({
  session,
  ...props
}) => {
  const [text, setText] = useState(() => session.getAllText());

  useEffect(() => {
    // Ensure initial state is synced
    setText(session.getAllText());

    return session.addListener(() => {
      setText(session.getAllText());
    });
  }, [session]);

  return <Markdown {...props}>{text}</Markdown>;
};
