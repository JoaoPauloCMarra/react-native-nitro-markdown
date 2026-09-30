# Streaming

`MarkdownStream` renders Markdown **as it arrives** — token-by-token LLM output,
chat messages, or any append-only text. Append-only plain text and fenced-code
content take a fast incremental path; structural changes re-parse with stable
AST node reuse (see [How incremental parsing works](#how-incremental-parsing-works)).

```tsx
import { useEffect } from "react";
import {
  MarkdownStream,
  useMarkdownSession,
} from "react-native-nitro-markdown";

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
subscribes to native range updates, batches them, and renders the growing text
(the incremental AST keeps stable nodes where safe):

```tsx
const session = useMarkdownSession();

session.getSession().append("Hello ");
session.getSession().append("**world**");
```

`MarkdownStream` batches append-only updates. Choose how it flushes:

| `updateStrategy` | Use when                                                    |
| ---------------- | ----------------------------------------------------------- |
| `"raf"`          | Smooth visual streaming (flush per animation frame).        |
| `"interval"`     | Bound update frequency — pair with `updateIntervalMs={50}`. |

Pass the controller from `useMarkdownSession()` directly. Use
`session.getSession()` only when another API needs the raw native session.

`useMarkdownSession()` owns the native session and disposes it on unmount.
When React StrictMode or Fast Refresh replays effects, the hook creates a fresh
session (seeded with `initialText`), increments `sessionGeneration`, and
returns a new controller object, so `MarkdownStream`, memoized consumers and
the controller methods keep working. `getSession()` never returns `null`. Text
streamed before the replay is not carried over: on Fast Refresh the streamed
text is lost.

## How incremental parsing works

`MarkdownStream` avoids full-buffer re-parsing only for the two safe fast paths:

- **Trailing plain text** — appends that only extend the final text node are
  merged into the existing AST without calling the parser. If the last line of
  the previous text could start a block once more text arrives (a lone `*`,
  `+`, `-`, `#`, or an ordinal such as `1.`), the append is re-parsed instead.
- **Fenced code content** — appends inside an open fenced code block are
  appended to the code text node.

Everything else (new blocks, emphasis, links, tables, closing fences, …) is
re-parsed and then diffed so stable nodes keep their identity (`reuseStableAstNodes`).
The fast paths are covered by deterministic call-count tests in
`src/__tests__/markdown-stream.test.ts` — a plain-text append never re-parses,
a structural append always does.

`MarkdownStream` reads only the changed range when a batch ends at the end of
the buffer and starts either at the previous end (an append) or at offset 0 (a
reset). Every other batch, including a replace at offset 0 that keeps later
text or an insert inside the batch, reads the full session text, as does a
native range-read failure.

If you change `updateIntervalMs`, `updateStrategy`, `useTransitionUpdates` or
`incrementalParsing` while a batch is pending, the stream re-subscribes and
flushes that batch with a full read, so no chunk is lost.

Session ranges are JavaScript UTF-16 `[from, to)` units. Boundaries inside a
surrogate pair (including emoji) are rejected with `invalid_range`; they are
never rounded to consume or replace the whole code point.

The session buffer cap is measured in UTF-8 bytes (10,485,760), the same unit
as the parser's `maxInputLength`. A write that would grow the buffer above the
cap throws `buffer_limit`. For example, 4,000,000 CJK characters are 12,000,000
UTF-8 bytes and are rejected even though they are only 4,000,000 UTF-16 units.

If any plugin defines `beforeParse`, incremental AST reuse is disabled so the
full pipeline runs correctly (see `sourceAstStatus` below).

## Large initial content

The first render parses the full session content synchronously by default
(`initialParseMode="sync"`). For very large initial documents, pass
`initialParseMode="async"`: the first frame renders immediately with
`sourceAstStatus: "disabled"` and `sourceAstDisabledReason: "initializing"`,
then parsing happens after mount and the AST becomes available on the next
render. Parse failures in async mode report `"parse-error"` and the last valid
state is retained.

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
