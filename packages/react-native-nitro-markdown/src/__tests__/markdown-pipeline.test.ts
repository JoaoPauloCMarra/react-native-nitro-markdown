import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Markdown, type MarkdownPlugin } from "../markdown";
import type { MarkdownNode } from "../headless";
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
});
