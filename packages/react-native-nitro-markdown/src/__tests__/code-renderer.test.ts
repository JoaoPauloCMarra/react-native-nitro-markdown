import "./setup";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MarkdownContext } from "../MarkdownContext";
import { CodeBlock } from "../renderers/code";
import { defaultMarkdownTheme, getMonoFontFamily, minimalMarkdownTheme } from "../theme";
import type { CodeHighlighter } from "../utils/code-highlight";
import { hostType } from "./host-type";
import { spyOnConsoleErrorIgnoringRendererDeprecation } from "./console-spy";

const highlighter: CodeHighlighter = () => [
  { text: "const", type: "keyword" },
  { text: " ", type: "default" },
  { text: "a", type: "default" },
  { text: " ", type: "default" },
  { text: "=", type: "operator" },
  { text: "=", type: "operator" },
  { text: " ", type: "default" },
  { text: "1", type: "number" },
];

const renderCode = (renderer?: ReactTestRenderer) => {
  const element = createElement(
    MarkdownContext.Provider,
    {
      value: {
        renderers: {},
        theme: defaultMarkdownTheme,
        stylingStrategy: "opinionated",
        highlightCode: highlighter,
      },
    },
    createElement(CodeBlock, { language: "js", content: "const a == 1" }),
  );
  if (renderer) {
    act(() => renderer.update(element));
    return renderer;
  }
  let created: ReactTestRenderer | undefined;
  const consoleErrorSpy = spyOnConsoleErrorIgnoringRendererDeprecation();

  try {
    act(() => {
      created = create(element);
    });
  } finally {
    consoleErrorSpy.mockRestore();
  }
  return created!;
};

describe("CodeBlock highlighting", () => {
  it("merges adjacent same-type tokens and reuses token styles across renders", () => {
    const renderer = renderCode();
    const codeText = renderer.root
      .findAllByType(hostType("Text"))
      .find((node) => node.props.selectable === true)!;
    const runs = codeText.findAll(
      (node) => node.type === hostType("Text") && node !== codeText,
      { deep: false },
    );

    expect(runs.map((run) => run.props.children)).toEqual([
      "const",
      " a ",
      "==",
      " ",
      "1",
    ]);
    const keywordStyle = runs[0]!.props.style;
    expect(keywordStyle).toEqual({
      color: defaultMarkdownTheme.colors.codeTokenColors?.keyword,
    });

    renderCode(renderer);
    const nextCodeText = renderer.root
      .findAllByType(hostType("Text"))
      .find((node) => node.props.selectable === true)!;
    const nextRuns = nextCodeText.findAll(
      (node) => node.type === hostType("Text") && node !== nextCodeText,
      { deep: false },
    );
    expect(nextRuns[0]!.props.style).toBe(keywordStyle);
  });
});

describe("CodeBlock highlighter failures", () => {
  it("throwing highlightCode falls back to plain code and reports", () => {
    const failure = new Error("highlight boom");
    const onError = jest.fn();
    let created: ReactTestRenderer | undefined;
    const consoleErrorSpy = spyOnConsoleErrorIgnoringRendererDeprecation();
    try {
      act(() => {
        created = create(
          createElement(
            MarkdownContext.Provider,
            {
              value: {
                renderers: {},
                theme: defaultMarkdownTheme,
                stylingStrategy: "opinionated",
                highlightCode: () => {
                  throw failure;
                },
                onError,
              },
            },
            createElement(CodeBlock, { language: "js", content: "const a = 1" }),
          ),
        );
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }

    const codeText = created!.root
      .findAllByType(hostType("Text"))
      .find((node) => node.props.selectable === true)!;
    expect(codeText.props.children).toBe("const a = 1");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]![0]).toBe(failure);
    expect(onError.mock.calls[0]![1]).toBe("transform");
  });
});

describe("CodeBlock highlighter failures without onError", () => {
  it("renders plain code when no error handler is provided", () => {
    let created: ReactTestRenderer | undefined;
    const consoleErrorSpy = spyOnConsoleErrorIgnoringRendererDeprecation();
    try {
      act(() => {
        created = create(
          createElement(
            MarkdownContext.Provider,
            {
              value: {
                renderers: {},
                theme: defaultMarkdownTheme,
                stylingStrategy: "opinionated",
                highlightCode: () => {
                  throw new Error("highlight boom");
                },
              },
            },
            createElement(CodeBlock, { language: "js", content: "x" }),
          ),
        );
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }
    const codeText = created!.root
      .findAllByType(hostType("Text"))
      .find((node) => node.props.selectable === true)!;
    expect(codeText.props.children).toBe("x");
  });
});

describe("CodeBlock language label", () => {
  it("code language label uses the mono font helper", () => {
    const theme = {
      ...minimalMarkdownTheme,
      showCodeLanguage: true,
      fontFamilies: { ...defaultMarkdownTheme.fontFamilies, mono: undefined },
    };
    let created: ReactTestRenderer | undefined;
    const consoleErrorSpy = spyOnConsoleErrorIgnoringRendererDeprecation();
    try {
      act(() => {
        created = create(
          createElement(
            MarkdownContext.Provider,
            { value: { renderers: {}, theme, stylingStrategy: "minimal" } },
            createElement(CodeBlock, { language: "js", content: "a" }),
          ),
        );
      });
    } finally {
      consoleErrorSpy.mockRestore();
    }
    const label = created!.root
      .findAllByType(hostType("Text"))
      .find((node) => node.props.children === "js")!;
    const expected = getMonoFontFamily(theme);
    expect(expected).toBeDefined();
    expect(label.props.style.fontFamily).toBe(expected);
  });
});
