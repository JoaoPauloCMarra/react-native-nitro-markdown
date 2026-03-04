import { createElement } from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { mockParser } from "./setup";
import { parseMarkdown, type MarkdownNode } from "../headless";
import { Markdown, type AstTransform, type MarkdownProps } from "../markdown";
import { MarkdownStream, type MarkdownStreamProps } from "../markdown-stream";
import type { MarkdownSession } from "../specs/MarkdownSession.nitro";

const replaceWinkInAst: AstTransform = (ast) => {
  const transformNode = (node: MarkdownNode): MarkdownNode => {
    const children = node.children?.map(transformNode);

    if (node.type === "text") {
      return {
        ...node,
        content: (node.content ?? "").replace(/:wink:/g, "😉"),
        children,
      };
    }

    return {
      ...node,
      children,
    };
  };

  return transformNode(ast);
};

const runtimeConsole = globalThis.console;
const originalConsoleError = runtimeConsole.error.bind(runtimeConsole);

beforeAll(() => {
  jest
    .spyOn(runtimeConsole, "error")
    .mockImplementation((message, ...optionalParams) => {
      if (
        typeof message === "string" &&
        message.includes("react-test-renderer is deprecated")
      ) {
        return;
      }

      originalConsoleError(message, ...optionalParams);
    });
});

afterAll(() => {
  jest.restoreAllMocks();
});

const renderMarkdown = (props: MarkdownProps): ReactTestRenderer => {
  let renderer: ReactTestRenderer | null = null;

  act(() => {
    renderer = TestRenderer.create(createElement(Markdown, props));
  });

  if (renderer === null) {
    throw new Error("Failed to render Markdown component");
  }

  return renderer;
};

const renderMarkdownStream = (
  props: MarkdownStreamProps,
): ReactTestRenderer => {
  let renderer: ReactTestRenderer | null = null;

  act(() => {
    renderer = TestRenderer.create(createElement(MarkdownStream, props));
  });

  if (renderer === null) {
    throw new Error("Failed to render MarkdownStream component");
  }

  return renderer;
};

const createMockSession = (initialText: string) => {
  let text = initialText;
  const listeners = new Set<(from: number, to: number) => void>();

  const emit = (from: number, to: number) => {
    for (const listener of listeners) {
      listener(from, to);
    }
  };

  const session: MarkdownSession = {
    __type: "HybridObject<MarkdownSession>",
    name: "MockMarkdownSession",
    toString: () => "[HybridObject MockMarkdownSession]",
    equals: (other) => other === session,
    dispose: () => undefined,
    append: (chunk) => {
      const from = text.length;
      text += chunk;
      emit(from, text.length);
      return text.length;
    },
    clear: () => {
      text = "";
      emit(0, 0);
    },
    getAllText: () => text,
    getLength: () => text.length,
    getTextRange: (from, to) => text.slice(from, to),
    highlightPosition: 0,
    addListener: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset: (newText) => {
      text = newText;
      emit(0, text.length);
    },
    replace: (from, to, newText) => {
      text = text.slice(0, from) + newText + text.slice(to);
      emit(from, from + newText.length);
      return text.length;
    },
  };

  return {
    session,
    append: session.append,
  };
};

describe("Markdown astTransform", () => {
  it("renders identically for no-op transform and no transform", () => {
    const content = "Hello **world** and [docs](https://example.com)";

    const withoutTransform = renderMarkdown({ children: content });
    const withNoopTransform = renderMarkdown({
      children: content,
      astTransform: (ast) => ast,
    });

    expect(JSON.stringify(withNoopTransform.toJSON())).toEqual(
      JSON.stringify(withoutTransform.toJSON()),
    );
  });

  it("applies transform output to render and onParseComplete payload", () => {
    const onParseComplete = jest.fn<
      void,
      [{ raw: string; ast: MarkdownNode; text: string }]
    >();

    const rendered = renderMarkdown({
      children: "Hello :wink:",
      astTransform: replaceWinkInAst,
      onParseComplete,
    });

    const completion = onParseComplete.mock.calls.at(-1)?.[0];

    expect(completion).toBeDefined();
    expect(completion?.raw).toBe("Hello :wink:");
    expect(completion?.text).toContain("😉");
    expect(JSON.stringify(completion?.ast)).toContain("😉");
    expect(JSON.stringify(rendered.toJSON())).toContain("😉");
  });

  it("applies astTransform when sourceAst is provided without calling native parser", () => {
    const sourceAst = parseMarkdown("Source :wink:");
    const onParseComplete = jest.fn<
      void,
      [{ raw: string; ast: MarkdownNode; text: string }]
    >();

    jest.clearAllMocks();

    const rendered = renderMarkdown({
      children: "ignored-by-source-ast",
      sourceAst,
      astTransform: replaceWinkInAst,
      onParseComplete,
    });

    const completion = onParseComplete.mock.calls.at(-1)?.[0];

    expect(completion).toBeDefined();
    expect(completion?.raw).toBe("ignored-by-source-ast");
    expect(completion?.text).toContain("😉");
    expect(JSON.stringify(rendered.toJSON())).toContain("😉");
    expect(mockParser.parse).not.toHaveBeenCalled();
    expect(mockParser.parseWithOptions).not.toHaveBeenCalled();
  });

  it("falls back to parsed AST when transform throws", () => {
    const onParseComplete = jest.fn<
      void,
      [{ raw: string; ast: MarkdownNode; text: string }]
    >();

    const rendered = renderMarkdown({
      children: "Hello :wink:",
      astTransform: () => {
        throw new Error("transform failed");
      },
      onParseComplete,
    });

    const completion = onParseComplete.mock.calls.at(-1)?.[0];

    expect(completion).toBeDefined();
    expect(completion?.text).toContain(":wink:");
    expect(completion?.text).not.toContain("😉");
    expect(JSON.stringify(rendered.toJSON())).toContain(":wink:");
  });

  it("does not retrigger parse callbacks for new options objects with same values", () => {
    const onParsingInProgress = jest.fn<void, []>();
    const onParseComplete = jest.fn<
      void,
      [{ raw: string; ast: MarkdownNode; text: string }]
    >();

    const rendered = renderMarkdown({
      children: "Stable options check",
      options: { gfm: true, math: true },
      onParsingInProgress,
      onParseComplete,
    });

    const parseStartCalls = onParsingInProgress.mock.calls.length;
    const parseCompleteCalls = onParseComplete.mock.calls.length;
    const rerenderProps: MarkdownProps = {
      children: "Stable options check",
      options: { gfm: true, math: true },
      onParsingInProgress,
      onParseComplete,
    };

    act(() => {
      rendered.update(createElement(Markdown, rerenderProps));
    });

    expect(onParsingInProgress).toHaveBeenCalledTimes(parseStartCalls);
    expect(onParseComplete).toHaveBeenCalledTimes(parseCompleteCalls);
  });
});

describe("MarkdownStream astTransform passthrough", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("passes astTransform to Markdown and applies it after stream updates", () => {
    jest.useFakeTimers();

    const onParseComplete = jest.fn<
      void,
      [{ raw: string; ast: MarkdownNode; text: string }]
    >();
    const { session, append } = createMockSession("Start :wink:");

    const rendered = renderMarkdownStream({
      session,
      astTransform: replaceWinkInAst,
      onParseComplete,
      updateIntervalMs: 10,
    });

    append(" then :wink:");

    act(() => {
      jest.advanceTimersByTime(10);
    });

    const completion = onParseComplete.mock.calls.at(-1)?.[0];

    expect(completion).toBeDefined();
    expect(completion?.text).toContain("😉");
    expect(completion?.text).not.toContain(":wink:");
    expect(JSON.stringify(rendered.toJSON())).toContain("😉");
  });
});
