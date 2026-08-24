import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Markdown, type MarkdownPlugin } from "../markdown";
import type { MarkdownNode } from "../headless";
import { MarkdownError } from "../errors";
import { mockParser } from "./setup";

jest.mock("../renderers/math", () => ({
  MathInline: "MathInline",
  MathBlock: "MathBlock",
}));

describe("Markdown plugin pipeline", () => {
  beforeEach(() => {
    mockParser.parse.mockClear();
    mockParser.parseWithOptions.mockClear();
  });

  it("re-runs the parse pipeline when plugins change", () => {
    const firstPlugins: MarkdownPlugin[] = [
      { name: "first", beforeParse: () => "first" },
    ];
    const secondPlugins: MarkdownPlugin[] = [
      { name: "second", beforeParse: () => "second" },
    ];
    const onParseComplete = jest.fn();
    let renderer: ReactTestRenderer | undefined;
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation((message?: unknown, ...args: unknown[]) => {
        if (
          typeof message === "string" &&
          message.includes("react-test-renderer is deprecated")
        ) {
          return;
        }
        process.stderr.write(
          [message, ...args].map((arg) => String(arg)).join(" ") + "\n",
        );
      });

    try {
      act(() => {
        renderer = create(
          createElement(
            Markdown,
            { plugins: firstPlugins, onParseComplete },
            "same input",
          ),
        );
      });

      expect(onParseComplete).toHaveBeenLastCalledWith(
        expect.objectContaining({ text: "first\n\n" }),
      );

      act(() => {
        renderer!.update(
          createElement(
            Markdown,
            { plugins: secondPlugins, onParseComplete },
            "same input",
          ),
        );
      });

      expect(onParseComplete).toHaveBeenLastCalledWith(
        expect.objectContaining({ text: "second\n\n" }),
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("bypasses parse cache when parseCache is false", () => {
    const onParseComplete = jest.fn();
    let renderer: ReactTestRenderer | undefined;
    const markdown = "parse-cache-bypass markdown input";
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation((message?: unknown, ...args: unknown[]) => {
        if (
          typeof message === "string" &&
          message.includes("react-test-renderer is deprecated")
        ) {
          return;
        }
        process.stderr.write(
          [message, ...args].map((arg) => String(arg)).join(" ") + "\n",
        );
      });

    try {
      act(() => {
        renderer = create(
          createElement(
            Markdown,
            { plugins: [], parseCache: false, onParseComplete },
            markdown,
          ),
        );
      });

      act(() => {
        renderer!.update(
          createElement(
            Markdown,
            { plugins: [], parseCache: false, onParseComplete },
            markdown,
          ),
        );
      });

      expect(mockParser.parse).toHaveBeenCalledTimes(2);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("reports native parser failures through onError", () => {
    const parseError = new Error("native parse failed");
    const onError = jest.fn();
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    mockParser.parse.mockImplementationOnce(() => {
      throw parseError;
    });

    try {
      act(() => {
        create(
          createElement(
            Markdown,
            { onError, parseCache: false },
            "native parser failure input",
          ),
        );
      });

      expect(onError).toHaveBeenCalledWith(parseError, "parse", undefined);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("preserves sourceOffsets through normalization and cache keys", () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    let renderer: ReactTestRenderer | undefined;

    try {
      act(() => {
        renderer = create(
          createElement(
            Markdown,
            { options: { sourceOffsets: false } },
            "source offset cache input",
          ),
        );
      });

      act(() => {
        renderer!.update(
          createElement(
            Markdown,
            { options: { sourceOffsets: true } },
            "source offset cache input",
          ),
        );
      });

      expect(mockParser.parseWithOptions).toHaveBeenNthCalledWith(
        1,
        "source offset cache input",
        { sourceOffsets: false },
      );
      expect(mockParser.parseWithOptions).toHaveBeenNthCalledWith(
        2,
        "source offset cache input",
        { sourceOffsets: true },
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("does not run beforeParse plugins when sourceAst is provided", () => {
    const beforeParse = jest.fn((text: string) => `${text} changed`);
    const sourceAst: MarkdownNode = {
      type: "document",
      children: [
        {
          type: "paragraph",
          children: [{ type: "text", content: "from source ast" }],
        },
      ],
    };
    const onParseComplete = jest.fn();
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation((message?: unknown, ...args: unknown[]) => {
        if (
          typeof message === "string" &&
          message.includes("react-test-renderer is deprecated")
        ) {
          return;
        }
        process.stderr.write(
          [message, ...args].map((arg) => String(arg)).join(" ") + "\n",
        );
      });

    try {
      act(() => {
        create(
          createElement(
            Markdown,
            {
              plugins: [{ name: "before", beforeParse }],
              sourceAst,
              onParseComplete,
            },
            "ignored markdown",
          ),
        );
      });

      expect(beforeParse).not.toHaveBeenCalled();
      expect(mockParser.parse).not.toHaveBeenCalled();
      expect(mockParser.parseWithOptions).not.toHaveBeenCalled();
      expect(onParseComplete).toHaveBeenCalledWith(
        expect.objectContaining({ text: "from source ast\n\n" }),
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("rejects a direct sourceAst cycle with a typed error before rendering", () => {
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
          createElement(
            Markdown,
            { sourceAst: root as MarkdownNode, onError },
            "ignored markdown",
          ),
        );
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }

    const [error, phase] = onError.mock.calls[0] as [
      MarkdownError,
      string,
      string | undefined,
    ];
    expect(error).toBeInstanceOf(MarkdownError);
    expect(error.code).toBe("invalid_ast");
    expect(error.source).toBe("render");
    expect(phase).toBe("parse");
  });

  it("rejects an indirect sourceAst cycle with a typed error", () => {
    const root = {
      type: "document" as const,
      children: [] as MarkdownNode[],
    };
    const paragraph = {
      type: "paragraph" as const,
      children: [] as MarkdownNode[],
    };
    root.children.push(paragraph as MarkdownNode);
    paragraph.children.push(root as unknown as MarkdownNode);
    const onError = jest.fn();
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    try {
      act(() => {
        create(
          createElement(
            Markdown,
            { sourceAst: root as MarkdownNode, onError },
            "ignored markdown",
          ),
        );
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "invalid_ast",
        source: "render",
      }),
      "parse",
      undefined,
    );
  });

  it("allows a shared-child sourceAst DAG", () => {
    const sharedText: MarkdownNode = { type: "text", content: "shared" };
    const sharedParagraph: MarkdownNode = {
      type: "paragraph",
      children: [sharedText],
    };
    const sourceAst: MarkdownNode = {
      type: "document",
      children: [sharedParagraph, sharedParagraph],
    };
    const onError = jest.fn();
    const onParseComplete = jest.fn();
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    try {
      act(() => {
        create(
          createElement(
            Markdown,
            { sourceAst, onError, onParseComplete },
            "ignored markdown",
          ),
        );
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }

    expect(onError).not.toHaveBeenCalled();
    expect(onParseComplete).toHaveBeenCalledWith(
      expect.objectContaining({ text: "shared\n\nshared\n\n" }),
    );
  });

  it("falls back when an afterParse plugin returns a cyclic AST", () => {
    const cyclic = {
      type: "document" as const,
      children: [] as MarkdownNode[],
    };
    cyclic.children.push(cyclic as unknown as MarkdownNode);
    const onError = jest.fn();
    const onParseComplete = jest.fn();
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    try {
      act(() => {
        create(
          createElement(
            Markdown,
            {
              plugins: [
                {
                  name: "cyclic",
                  afterParse: () => cyclic as MarkdownNode,
                },
              ],
              onError,
              onParseComplete,
            },
            "plugin fallback",
          ),
        );
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: "invalid_ast" }),
      "after-plugin",
      "cyclic",
    );
    expect(onParseComplete).toHaveBeenCalledWith(
      expect.objectContaining({ text: "plugin fallback\n\n" }),
    );
  });

  it("falls back when astTransform returns a cyclic AST", () => {
    const cyclic = {
      type: "document" as const,
      children: [] as MarkdownNode[],
    };
    cyclic.children.push(cyclic as unknown as MarkdownNode);
    const onParseComplete = jest.fn();
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    try {
      act(() => {
        create(
          createElement(
            Markdown,
            {
              astTransform: () => cyclic as MarkdownNode,
              onParseComplete,
            },
            "transform fallback",
          ),
        );
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }

    expect(onParseComplete).toHaveBeenCalledWith(
      expect.objectContaining({ text: "transform fallback\n\n" }),
    );
  });

  it("preserves unchanged sourceAst child identity between renders", () => {
    const firstParagraph: MarkdownNode = {
      type: "paragraph",
      children: [{ type: "text", content: "stable paragraph" }],
    };
    const secondParagraph: MarkdownNode = {
      type: "paragraph",
      children: [{ type: "text", content: "first version" }],
    };
    const nextSecondParagraph: MarkdownNode = {
      type: "paragraph",
      children: [{ type: "text", content: "second version" }],
    };
    const renderParagraph = jest.fn(({ node }: { node: MarkdownNode }) =>
      createElement("Text", null, node.children?.[0]?.content ?? ""),
    );
    const renderers = {
      paragraph: renderParagraph,
    };
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation((message?: unknown, ...args: unknown[]) => {
        if (
          typeof message === "string" &&
          message.includes("react-test-renderer is deprecated")
        ) {
          return;
        }
        process.stderr.write(
          [message, ...args].map((arg) => String(arg)).join(" ") + "\n",
        );
      });
    let renderer: ReactTestRenderer | undefined;

    try {
      act(() => {
        renderer = create(
          createElement(
            Markdown,
            {
              sourceAst: {
                type: "document",
                children: [firstParagraph, secondParagraph],
              },
              renderers,
            },
            "ignored markdown",
          ),
        );
      });

      act(() => {
        renderer!.update(
          createElement(
            Markdown,
            {
              sourceAst: {
                type: "document",
                children: [firstParagraph, nextSecondParagraph],
              },
              renderers,
            },
            "ignored markdown",
          ),
        );
      });

      const renderedTexts = renderParagraph.mock.calls.map(
        ([props]) => props.node.children?.[0]?.content,
      );
      expect(renderedTexts.filter((text) => text === "stable paragraph")).toHaveLength(1);
      expect(renderedTexts.filter((text) => text === "first version")).toHaveLength(1);
      expect(renderedTexts.filter((text) => text === "second version")).toHaveLength(1);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("scopes the parse cache per Markdown instance", () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    const markdown = "instance-scoped cache input";

    try {
      act(() => {
        create(createElement(Markdown, {}, markdown));
      });
      act(() => {
        create(createElement(Markdown, {}, markdown));
      });

      expect(mockParser.parse).toHaveBeenCalledTimes(2);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("only clones cached ASTs when a post-parse transform requires isolation", () => {
    const results: MarkdownNode[] = [];
    const onParseComplete = jest.fn(({ ast }: { ast: MarkdownNode }) => {
      results.push(ast);
    });
    let renderer: ReactTestRenderer | undefined;
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    try {
      act(() => {
        renderer = create(
          createElement(Markdown, { onParseComplete }, "cache identity"),
        );
      });
      act(() => {
        renderer!.update(createElement(Markdown, { onParseComplete }, "other"));
      });
      act(() => {
        renderer!.update(
          createElement(Markdown, { onParseComplete }, "cache identity"),
        );
      });

      expect(results[2]).toBe(results[0]);

      act(() => {
        renderer!.update(
          createElement(
            Markdown,
            { onParseComplete, astTransform: (ast) => ast },
            "cache identity",
          ),
        );
      });
      expect(results[3]).not.toBe(results[0]);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("protects cached ASTs from consumer callback mutation", () => {
    const markdown = "immutable cache input";
    const onParseComplete = jest.fn(({ ast }: { ast: MarkdownNode }) => {
      if (onParseComplete.mock.calls.length !== 1) return;

      expect(Object.isFrozen(ast)).toBe(true);
      expect(Object.isFrozen(ast.children)).toBe(true);
      expect(Object.isFrozen(ast.children?.[0])).toBe(true);
      expect(Object.isFrozen(ast.children?.[0]?.children)).toBe(true);
      expect(Object.isFrozen(ast.children?.[0]?.children?.[0])).toBe(true);

      try {
        (ast.children as MarkdownNode[]).push({
          type: "text",
          content: "poison",
        });
      } catch {
      }
      try {
        (ast.children?.[0]?.children?.[0] as MarkdownNode).content = "poison";
      } catch {
      }
    });
    let renderer: ReactTestRenderer | undefined;
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    try {
      act(() => {
        renderer = create(
          createElement(Markdown, { onParseComplete }, markdown),
        );
      });
      act(() => {
        renderer!.update(createElement(Markdown, { onParseComplete }, "other"));
      });
      act(() => {
        renderer!.update(
          createElement(Markdown, { onParseComplete }, markdown),
        );
      });

      const result = onParseComplete.mock.calls.at(-1)?.[0] as {
        ast: MarkdownNode;
        text: string;
      };
      expect(result.text).toBe(`${markdown}\n\n`);
      expect(result.ast.children).toHaveLength(1);
      expect(result.ast.children?.[0]?.children?.[0]?.content).toBe(markdown);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("freezes ASTs passed to post-parse callbacks", () => {
    const observed: boolean[] = [];
    const plugin: MarkdownPlugin = {
      afterParse: (ast) => {
        observed.push(Object.isFrozen(ast), Object.isFrozen(ast.children));
        return ast;
      },
    };

    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    try {
      act(() => {
        create(
          createElement(
            Markdown,
            {
              plugins: [plugin],
              astTransform: (ast) => {
                observed.push(
                  Object.isFrozen(ast),
                  Object.isFrozen(ast.children),
                );
                return ast;
              },
            },
            "frozen callback input",
          ),
        );
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }

    expect(observed).toEqual([true, true, true, true]);
  });

  it("reuses cached ASTs within an instance and reports bounded cache stats", () => {
    const onParseComplete = jest.fn();
    let renderer: ReactTestRenderer | undefined;
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    try {
      act(() => {
        renderer = create(
          createElement(Markdown, { onParseComplete }, "cached input"),
        );
      });
      act(() => {
        renderer!.update(
          createElement(
            Markdown,
            { onParseComplete, astTransform: (ast) => ast },
            "cached input",
          ),
        );
      });

      expect(mockParser.parse).toHaveBeenCalledTimes(1);
      const lastResult = onParseComplete.mock.lastCall?.[0] as {
        cacheStats?: { hits: number; misses: number; evictions: number; size: number };
      };
      expect(lastResult.cacheStats).toEqual({
        hits: 1,
        misses: 1,
        evictions: 0,
        size: 1,
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("evicts the oldest entry when the per-instance cache exceeds its bound", () => {
    const onParseComplete = jest.fn();
    let renderer: ReactTestRenderer | undefined;
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    try {
      act(() => {
        renderer = create(
          createElement(Markdown, { onParseComplete }, "seed input"),
        );
      });

      for (let index = 0; index < 40; index += 1) {
        act(() => {
          renderer!.update(
            createElement(Markdown, { onParseComplete }, `input ${index}`),
          );
        });
      }

      const lastResult = onParseComplete.mock.lastCall?.[0] as {
        cacheStats?: { evictions: number; size: number };
      };
      expect(lastResult.cacheStats?.size).toBeLessThanOrEqual(32);
      expect(lastResult.cacheStats?.evictions).toBeGreaterThan(0);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
