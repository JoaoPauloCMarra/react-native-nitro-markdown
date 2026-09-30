import "./setup";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MarkdownContext } from "../MarkdownContext";
import { CodeBlock } from "../renderers/code";
import { defaultMarkdownTheme } from "../theme";
import type { CodeHighlighter } from "../utils/code-highlight";
import { hostType } from "./host-type";

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
  act(() => {
    created = create(element);
  });
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
