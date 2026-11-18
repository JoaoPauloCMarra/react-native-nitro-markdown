import { mockParser } from "./setup";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import {
  MarkdownStream,
  type MarkdownStreamProps,
  type MarkdownStreamRenderProps,
} from "../markdown-stream";
import type { MarkdownNode } from "../headless";
import type {
  MarkdownSession,
  StreamViewRequest,
} from "../specs/MarkdownSession.nitro";
import { parseSessionView } from "../utils/stream-view";

const markdownMock = jest.fn((_props: { children?: string; sourceAst?: MarkdownNode }) => null);

jest.mock("../markdown", () => ({
  Markdown: (props: { children?: string; sourceAst?: MarkdownNode }) => markdownMock(props),
}));

type ViewFlags = { modified: boolean; plainTail: boolean; openCodeFence: boolean };
type SessionListener = (from: number, to: number) => void;
type ViewSession = MarkdownSession & {
  appendText: (chunk: string) => void;
  setFlags: (flags: Partial<ViewFlags>) => void;
};

const PLAIN: ViewFlags = { modified: false, plainTail: true, openCodeFence: false };

function createViewSession(initialText: string, initialFlags: ViewFlags = PLAIN): ViewSession {
  let listener: SessionListener | null = null;
  let text = initialText;
  let flags = initialFlags;

  return {
    name: "MarkdownSession",
    equals: jest.fn(() => false),
    append: jest.fn(),
    clear: jest.fn(),
    dispose: jest.fn(),
    appendText: (chunk: string) => {
      const from = text.length;
      text += chunk;
      listener?.(from, text.length);
    },
    setFlags: (next: Partial<ViewFlags>) => {
      flags = { ...flags, ...next };
    },
    getAllText: jest.fn(() => text),
    getLength: jest.fn(() => text.length),
    getTextRange: jest.fn((from: number, to: number) => text.slice(from, to)),
    parse: jest.fn(() => mockParser.parse(text)),
    parseWithOptions: jest.fn((options: Parameters<typeof mockParser.parseWithOptions>[1]) =>
      mockParser.parseWithOptions(text, options),
    ),
    parseStreamView: jest.fn(
      (options: Parameters<typeof mockParser.parseWithOptions>[1], _request: StreamViewRequest) =>
        `{"modified":${flags.modified},"plainTail":${flags.plainTail},"openCodeFence":${flags.openCodeFence},"document":${mockParser.parseWithOptions(text, options)}}`,
    ),
    highlightPosition: 0,
    replace: jest.fn(),
    reset: jest.fn(),
    addListener: jest.fn((nextListener: SessionListener) => {
      listener = nextListener;
      return () => {
        listener = null;
      };
    }),
  } as unknown as ViewSession;
}

function renderStream(props: MarkdownStreamProps): TestRenderer.ReactTestRenderer {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(
      React.createElement(MarkdownStream, { updateIntervalMs: 1, ...props }),
    );
  });
  return renderer!;
}

function flushAppend(session: ViewSession, chunk: string): void {
  act(() => {
    session.appendText(chunk);
    jest.runOnlyPendingTimers();
  });
}

const plainParseCalls = (session: ViewSession): number =>
  (session.parse as jest.Mock).mock.calls.length +
  (session.parseWithOptions as jest.Mock).mock.calls.length;

const viewCalls = (session: ViewSession): unknown[][] =>
  (session.parseStreamView as jest.Mock).mock.calls;

describe("MarkdownStream streaming view", () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    markdownMock.mockClear();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    jest.useRealTimers();
  });

  it("does not call the stream view when streaming is off", () => {
    const session = createViewSession("hello");
    renderStream({ session });
    flushAppend(session, "\n\n# title");

    expect(viewCalls(session)).toHaveLength(0);
    expect(plainParseCalls(session)).toBe(2);
  });

  it("parses through the stream view while streaming", () => {
    const session = createViewSession("hello");
    renderStream({ session, streaming: true });

    expect(viewCalls(session)).toEqual([[{}, {}]]);
    expect(plainParseCalls(session)).toBe(0);
    expect(markdownMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        children: "hello",
        sourceAst: expect.objectContaining({ type: "document" }),
      }),
    );

    flushAppend(session, "\n\n# title");

    expect(viewCalls(session)).toHaveLength(2);
    expect(plainParseCalls(session)).toBe(0);
    expect(markdownMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ children: "hello\n\n# title" }),
    );
  });

  it("passes the stream options and the parser options to the native call", () => {
    const session = createViewSession("hello");
    renderStream({
      session,
      streaming: true,
      streamingOptions: { tables: "hidden", media: "hidden" },
      options: { gfm: false },
    });

    expect(viewCalls(session)).toEqual([[{ gfm: false }, { tables: "hidden", media: "hidden" }]]);
  });

  it("sends only the hidden modes, so an unknown value means progressive", () => {
    const session = createViewSession("hello");
    renderStream({
      session,
      streaming: true,
      streamingOptions: {
        tables: "progressive",
        codeBlocks: "nope" as "hidden",
        media: "hidden",
      },
    });

    expect(viewCalls(session)).toEqual([[{}, { media: "hidden" }]]);
  });

  it("appends plain text without a native call when the tail is plain and unchanged", () => {
    const session = createViewSession("hello");
    renderStream({ session, streaming: true });
    flushAppend(session, " world");

    expect(viewCalls(session)).toHaveLength(1);
    expect(markdownMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ children: "hello world" }),
    );
  });

  it("parses a plain-text append when the tail holds syntax", () => {
    const session = createViewSession("hello *", { ...PLAIN, plainTail: false });
    renderStream({ session, streaming: true });
    flushAppend(session, "world");

    expect(viewCalls(session)).toHaveLength(2);
  });

  it("parses a plain-text append when the view hides part of the tail", () => {
    const session = createViewSession("hello", { ...PLAIN, modified: true });
    renderStream({ session, streaming: true });
    flushAppend(session, " world");

    expect(viewCalls(session)).toHaveLength(2);
  });

  it("parses the source once when streaming ends", () => {
    const session = createViewSession("hello", { ...PLAIN, modified: true });
    const renderer = renderStream({ session, streaming: true });
    expect(plainParseCalls(session)).toBe(0);

    act(() => {
      renderer.update(
        React.createElement(MarkdownStream, { session, updateIntervalMs: 1, streaming: false }),
      );
    });

    expect(plainParseCalls(session)).toBe(1);
    expect(viewCalls(session)).toHaveLength(1);
  });

  it("parses again when the stream options change", () => {
    const session = createViewSession("hello");
    const renderer = renderStream({ session, streaming: true });

    act(() => {
      renderer.update(
        React.createElement(MarkdownStream, {
          session,
          updateIntervalMs: 1,
          streaming: true,
          streamingOptions: { codeBlocks: "hidden" },
        }),
      );
    });

    expect(viewCalls(session)).toEqual([
      [{}, {}],
      [{}, { codeBlocks: "hidden" }],
    ]);
  });

  it("does not parse again when the stream options object changes but its values do not", () => {
    const session = createViewSession("hello");
    const renderer = renderStream({
      session,
      streaming: true,
      streamingOptions: { tables: "hidden" },
    });

    act(() => {
      renderer.update(
        React.createElement(MarkdownStream, {
          session,
          updateIntervalMs: 1,
          streaming: true,
          streamingOptions: { tables: "hidden" },
        }),
      );
    });

    expect(viewCalls(session)).toHaveLength(1);
  });

  it("reports an open code fence to a custom renderer", () => {
    const session = createViewSession("```js\nconst", {
      modified: false,
      plainTail: false,
      openCodeFence: true,
    });
    const seen: boolean[] = [];
    const renderMarkdown = (props: MarkdownStreamRenderProps) => {
      seen.push(props.openCodeFence);
      return null;
    };
    renderStream({ session, streaming: true, renderMarkdown });
    expect(seen[seen.length - 1]).toBe(true);

    session.setFlags({ openCodeFence: false });
    flushAppend(session, "\n```\n");
    expect(seen[seen.length - 1]).toBe(false);
  });

  it("reports no open code fence when streaming is off", () => {
    const session = createViewSession("```js\nconst", { ...PLAIN, openCodeFence: true });
    const seen: boolean[] = [];
    renderStream({
      session,
      renderMarkdown: (props) => {
        seen.push(props.openCodeFence);
        return null;
      },
    });

    expect(seen).toEqual([false]);
  });

  it("parses the source when the session has no stream view", () => {
    const session = createViewSession("hello");
    Reflect.deleteProperty(session, "parseStreamView");
    renderStream({ session, streaming: true });

    expect(plainParseCalls(session)).toBe(1);
    expect(markdownMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ children: "hello" }),
    );
  });

  it("reports an invalid stream view through onError and keeps the last state", () => {
    const session = createViewSession("hello");
    const onError = jest.fn();
    renderStream({ session, streaming: true, onError });

    (session.parseStreamView as jest.Mock).mockImplementationOnce(() => '{"modified":false}');
    flushAppend(session, "\n\n# title");

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![1]).toBe("parse");
    expect(markdownMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ children: "hello" }),
    );
  });
});

describe("parseSessionView", () => {
  it("returns the document and whether plain text can be appended", () => {
    const session = createViewSession("hello");
    const parsed = parseSessionView(session, undefined, {});

    expect(parsed.ast.type).toBe("document");
    expect(parsed.view).toEqual({ kind: "view", appendable: true, openCodeFence: false });
  });

  it("freezes the document when freezeAst is set", () => {
    const session = createViewSession("hello");
    const parsed = parseSessionView(session, { freezeAst: true }, {});

    expect(Object.isFrozen(parsed.ast)).toBe(true);
  });

  it.each([
    ["not JSON", "nope"],
    ["an array", "[]"],
    ["a flag that is not a boolean", '{"modified":0,"plainTail":true,"openCodeFence":false,"document":{"type":"document"}}'],
    ["a missing document", '{"modified":false,"plainTail":true,"openCodeFence":false}'],
    ["a root that is not a document", '{"modified":false,"plainTail":true,"openCodeFence":false,"document":{"type":"paragraph"}}'],
  ])("throws a parse error for %s", (_name, json) => {
    const session = createViewSession("hello");
    (session.parseStreamView as jest.Mock).mockReturnValueOnce(json);

    expect(() => parseSessionView(session, undefined, {})).toThrow(
      expect.objectContaining({ name: "MarkdownError", source: "parse" }),
    );
  });
});
