# Streaming

`MarkdownStream` renders Markdown **as it arrives** — token-by-token LLM output,
chat messages, or any append-only text — without re-parsing the whole buffer on
every update. It is the reason this package exists for AI apps.

```tsx
import { useEffect } from "react";
import { MarkdownStream, useMarkdownSession } from "react-native-nitro-markdown";

export function ChatMessage({ text }: { text: string }) {
  const session = useMarkdownSession();

  useEffect(() => {
    session.reset(text);
  }, [session, text]);

  return (
    <MarkdownStream session={session} updateStrategy="raf" incrementalParsing />
  );
}
```

## Token-by-token output

Append tokens to the hook-owned session as they stream in; `MarkdownStream`
subscribes to native range updates and re-renders only what changed:

```tsx
const session = useMarkdownSession();

session.getSession().append("Hello ");
session.getSession().append("**world**");
```

`MarkdownStream` batches append-only updates. Choose how it flushes:

| `updateStrategy` | Use when |
| ---------------- | -------- |
| `"raf"` | Smooth visual streaming (flush per animation frame). |
| `"interval"` | Bound update frequency — pair with `updateIntervalMs={50}`. |

Pass the controller from `useMarkdownSession()` directly. Use
`session.getSession()` only when another API needs the raw native session.

## How incremental parsing works

`MarkdownStream` avoids full-buffer reads on stable parent renders: it uses
native range reads for append-only updates and only falls back to a full
session read for reset-like changes, replacements inside existing text, or a
native range-read failure.

If any plugin defines `beforeParse`, incremental AST reuse is disabled so the
full pipeline runs correctly (see `sourceAstStatus` below).

## Custom stream rendering

Use `renderMarkdown` to keep the session subscription, batching, and incremental
AST updates while another component owns the rendering:

```tsx
<MarkdownStream
  session={session}
  renderMarkdown={({ text, sourceAst, markdownProps }) => (
    <MyRenderer markdown={text} ast={sourceAst} fallbackProps={markdownProps} />
  )}
/>
```

## Headless streaming state

`useMarkdownStreamState` gives you the streaming state without the wrapper:

```tsx
const { text, sourceAst, sourceAstStatus } = useMarkdownStreamState({
  session,
  updateStrategy: "raf",
});
```

`sourceAst` is available when the stream can safely reuse Nitro's parsed AST.
When a `beforeParse` plugin is present, `sourceAstStatus` becomes `"disabled"`,
`sourceAstDisabledReason` is `"beforeParse-plugin"`, and `sourceAst` is omitted —
render from `text` so the full plugin pipeline can run.

Parser failures call `onError(error, "parse")`. A failed update retains the last
valid text and AST. If the initial parse fails, `sourceAstStatus` is `"disabled"`,
`sourceAstDisabledReason` is `"parse-error"`, and `sourceAst` is omitted. The
default `<MarkdownStream>` renderer renders nothing until a later update parses.

## See also

- [Usage](./usage.md) — the static `<Markdown>` component.
- [API reference](./api-reference.md) — `MarkdownStreamProps`, session types.
