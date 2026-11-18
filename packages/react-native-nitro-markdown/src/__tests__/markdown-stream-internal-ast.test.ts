import { createElement, type ReactNode } from "react";
import { act, create } from "react-test-renderer";
import { Markdown, type MarkdownPlugin } from "../markdown";
import { MarkdownStream } from "../markdown-stream";
import { createMarkdownSession } from "../MarkdownSession";
import type { MarkdownNode } from "../headless";
import { cloneMarkdownNode } from "../utils/freeze-ast";
import { spyOnConsoleErrorIgnoringRendererDeprecation } from "./console-spy";
import "./setup";

jest.mock("../utils/freeze-ast", () => {
  const actual = jest.requireActual("../utils/freeze-ast");
  return {
    ...actual,
    cloneMarkdownNode: jest.fn(actual.cloneMarkdownNode),
  };
});

const cloneSpy = cloneMarkdownNode as jest.MockedFunction<
  typeof cloneMarkdownNode
>;

const flush = () => {
  act(() => {
    jest.advanceTimersByTime(100);
  });
};

const createParagraphProbe = () => {
  const seen: MarkdownNode[] = [];
  const renderer = ({
    node,
    children,
  }: {
    node: MarkdownNode;
    children: ReactNode;
  }) => {
    seen.push(node);
    return children;
  };
  return { seen, renderer };
};

describe("MarkdownStream internal AST", () => {
  let deprecationSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    cloneSpy.mockClear();
    deprecationSpy = spyOnConsoleErrorIgnoringRendererDeprecation();
  });

  afterEach(() => {
    deprecationSpy.mockRestore();
    jest.useRealTimers();
  });

  it("does not clone the stream's own AST on flush", () => {
    const session = createMarkdownSession();
    session.append("first block\n\n");
    act(() => {
      create(createElement(MarkdownStream, { session, updateIntervalMs: 10 }));
    });
    cloneSpy.mockClear();

    session.append("second ");
    flush();
    session.append("block\n\n");
    flush();
    session.append("third block");
    flush();

    expect(cloneSpy).not.toHaveBeenCalled();
  });

  it("isolates a custom renderer without freezeAst and skips cloneMarkdownNode", () => {
    const session = createMarkdownSession();
    session.append("first block");
    const { seen, renderer } = createParagraphProbe();
    let streamAst: MarkdownNode | undefined;
    act(() => {
      create(
        createElement(MarkdownStream, {
          session,
          updateIntervalMs: 10,
          renderers: { paragraph: renderer },
          renderMarkdown: ({ markdownProps }) => {
            streamAst = markdownProps.sourceAst;
            return createElement(Markdown, markdownProps);
          },
        }),
      );
    });
    cloneSpy.mockClear();
    seen.length = 0;
    session.append(" more");
    flush();

    expect(cloneSpy).not.toHaveBeenCalled();
    expect(streamAst).toBeDefined();
    expect(seen.length).toBeGreaterThan(0);
    for (const node of seen) {
      expect(streamAst!.children).not.toContain(node);
    }
    const received = seen.at(-1)!;
    const ownNode = streamAst!.children![0]!;
    const before = JSON.stringify(ownNode);
    received.children = [];
    received.type = "heading";
    expect(JSON.stringify(ownNode)).toBe(before);
  });

  it("keeps clone identity of an unchanged block for custom renderers", () => {
    const session = createMarkdownSession();
    session.append("first block\n\n");
    const { seen, renderer } = createParagraphProbe();
    act(() => {
      create(
        createElement(MarkdownStream, {
          session,
          updateIntervalMs: 10,
          renderers: { paragraph: renderer },
        }),
      );
    });
    session.append("second block");
    flush();
    session.append(" grows");
    flush();

    const isFirst = (node: MarkdownNode) =>
      node.children?.some((child) => child.content === "first block");
    const isSecond = (node: MarkdownNode) =>
      node.children?.some((child) => child.content?.startsWith("second block"));
    const firstBlocks = seen.filter(isFirst);
    const secondBlocks = seen.filter(isSecond);
    expect(new Set(firstBlocks).size).toBe(1);
    expect(new Set(secondBlocks).size).toBeGreaterThan(1);
    expect(cloneSpy).not.toHaveBeenCalled();
  });

  it("keeps an unchanged block identity across flushes", () => {
    const session = createMarkdownSession();
    session.append("first block\n\n");
    const { seen, renderer } = createParagraphProbe();
    act(() => {
      create(
        createElement(MarkdownStream, {
          session,
          updateIntervalMs: 10,
          renderers: { paragraph: renderer },
        }),
      );
    });

    session.append("second block");
    flush();
    session.append(" grows");
    flush();

    const firstBlocks = seen.filter((node) =>
      node.children?.some((child) => child.content === "first block"),
    );
    expect(firstBlocks.length).toBeGreaterThanOrEqual(1);
    expect(new Set(firstBlocks).size).toBe(1);
    expect(Object.isFrozen(firstBlocks[0])).toBe(false);
  });

  it("renders frozen nodes when freezeAst is true", () => {
    const session = createMarkdownSession();
    session.append("first block\n\n");
    const { seen, renderer } = createParagraphProbe();
    act(() => {
      create(
        createElement(MarkdownStream, {
          session,
          updateIntervalMs: 10,
          options: { freezeAst: true },
          renderers: { paragraph: renderer },
        }),
      );
    });
    session.append("second block");
    flush();
    session.append(" grows");
    flush();

    expect(seen.length).toBeGreaterThan(0);
    for (const node of seen) {
      expect(Object.isFrozen(node)).toBe(true);
      expect(Object.isFrozen(node.children)).toBe(true);
    }
    expect(cloneSpy).not.toHaveBeenCalled();
  });

  it("takes the fast path for a custom renderer with freezeAst", () => {
    const session = createMarkdownSession();
    session.append("first block");
    const { seen, renderer } = createParagraphProbe();
    act(() => {
      create(
        createElement(MarkdownStream, {
          session,
          updateIntervalMs: 10,
          options: { freezeAst: true },
          renderers: { paragraph: renderer },
        }),
      );
    });
    cloneSpy.mockClear();
    seen.length = 0;
    session.append(" more");
    flush();

    expect(cloneSpy).not.toHaveBeenCalled();
    expect(seen.length).toBeGreaterThan(0);
    for (const node of seen) expect(Object.isFrozen(node)).toBe(true);
  });

  it("still clones for astTransform", () => {
    const session = createMarkdownSession();
    session.append("first block");
    const received: MarkdownNode[] = [];
    act(() => {
      create(
        createElement(MarkdownStream, {
          session,
          updateIntervalMs: 10,
          astTransform: (ast: MarkdownNode) => {
            received.push(ast);
            return ast;
          },
        }),
      );
    });
    cloneSpy.mockClear();
    session.append(" more");
    flush();

    expect(cloneSpy).toHaveBeenCalled();
    const streamAst = cloneSpy.mock.calls[0]?.[0];
    expect(received.length).toBeGreaterThan(0);
    for (const ast of received) expect(ast).not.toBe(streamAst);
  });

  it("still clones for plugins", () => {
    const session = createMarkdownSession();
    session.append("first block");
    const afterParse = jest.fn((ast: MarkdownNode) => ast);
    const plugins: MarkdownPlugin[] = [{ name: "probe", afterParse }];
    act(() => {
      create(
        createElement(MarkdownStream, {
          session,
          updateIntervalMs: 10,
          plugins,
        }),
      );
    });
    cloneSpy.mockClear();
    session.append(" more");
    flush();

    expect(cloneSpy).toHaveBeenCalled();
    const streamAst = cloneSpy.mock.calls[0]?.[0];
    expect(afterParse.mock.calls.length).toBeGreaterThan(0);
    for (const [ast] of afterParse.mock.calls) {
      expect(ast).not.toBe(streamAst);
    }
  });

  it("still clones for onParseComplete", () => {
    const session = createMarkdownSession();
    session.append("first block");
    const onParseComplete = jest.fn();
    act(() => {
      create(
        createElement(MarkdownStream, {
          session,
          updateIntervalMs: 10,
          onParseComplete,
        }),
      );
    });
    cloneSpy.mockClear();
    onParseComplete.mockClear();
    session.append(" more");
    flush();

    expect(cloneSpy).toHaveBeenCalled();
    const streamAst = cloneSpy.mock.calls[0]?.[0];
    expect(onParseComplete).toHaveBeenCalled();
    const { ast } = onParseComplete.mock.calls.at(-1)![0] as {
      ast: MarkdownNode;
    };
    expect(ast).not.toBe(streamAst);
  });

  it("still validates a caller-supplied cyclic sourceAst", () => {
    const root = {
      type: "document" as const,
      children: [] as MarkdownNode[],
    };
    root.children.push(root as unknown as MarkdownNode);
    const onError = jest.fn();
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    try {
      act(() => {
        create(
          createElement(Markdown, {
            sourceAst: root as MarkdownNode,
            onError,
            children: "ignored",
          }),
        );
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }

    expect(cloneSpy).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "invalid_ast" }),
      "parse",
      undefined,
    );
  });

  it("renders a stream-produced AST passed by a caller to a plain Markdown", () => {
    const session = createMarkdownSession();
    session.append("first block\n\nsecond block");
    let captured: MarkdownNode | undefined;
    act(() => {
      create(
        createElement(MarkdownStream, {
          session,
          updateIntervalMs: 10,
          renderMarkdown: ({ markdownProps }) => {
            captured = markdownProps.sourceAst;
            return null;
          },
        }),
      );
    });
    expect(captured).toBeDefined();

    const onError = jest.fn();
    const { seen, renderer } = createParagraphProbe();
    act(() => {
      create(
        createElement(Markdown, {
          sourceAst: captured!,
          onError,
          renderers: { paragraph: renderer },
          children: "ignored",
        }),
      );
    });

    expect(onError).not.toHaveBeenCalled();
    expect(seen.length).toBe(2);
  });
});
