import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Markdown } from "../markdown";
import type { MarkdownNode } from "../headless";
import { mockParser } from "./setup";

const LONG_TEXT = "Paragraph text that repeats.\n\n".repeat(1_000);

describe("Markdown re-render stability", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockParser.parse.mockClear();
    mockParser.parseWithOptions.mockClear();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  const parseCalls = () =>
    mockParser.parse.mock.calls.length + mockParser.parseWithOptions.mock.calls.length;

  it("does not re-parse when inline onParseComplete and renderers change identity", () => {
    const completions: string[] = [];
    const renderTree = () =>
      createElement(
        Markdown,
        {
          onParseComplete: (result) => completions.push(result.raw),
          renderers: { heading: ({ children }) => children },
        },
        LONG_TEXT,
      );

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(renderTree());
    });
    act(() => {
      renderer!.update(renderTree());
    });
    act(() => {
      renderer!.update(renderTree());
    });

    expect(parseCalls()).toBe(1);
    expect(completions).toHaveLength(1);
  });

  it("calls the latest onParseComplete when the text changes", () => {
    const first = jest.fn();
    const second = jest.fn();
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(createElement(Markdown, { onParseComplete: first }, "one"));
    });
    act(() => {
      renderer!.update(createElement(Markdown, { onParseComplete: second }, "one"));
    });
    act(() => {
      renderer!.update(createElement(Markdown, { onParseComplete: second }, "two"));
    });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenLastCalledWith(
      expect.objectContaining({ raw: "two" }),
    );
  });

  it("keys virtualized blocks by type and index so growing blocks keep their key", () => {
    const makeAst = (end: number): MarkdownNode => ({
      type: "document",
      beg: 0,
      end,
      children: [
        { type: "paragraph", beg: 0, end: 10, children: [{ type: "text", content: "a" }] },
        { type: "paragraph", beg: 12, end, children: [{ type: "text", content: "b" }] },
      ],
    });

    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        createElement(Markdown, { virtualize: true, sourceAst: makeAst(20) }, "a\n\nb"),
      );
    });
    const list = renderer!.root.findByType("FlatList" as never);
    const keyExtractor = list.props.keyExtractor as (node: MarkdownNode, index: number) => string;
    const firstKeys = (list.props.data as MarkdownNode[]).map(keyExtractor);

    act(() => {
      renderer!.update(
        createElement(Markdown, { virtualize: true, sourceAst: makeAst(25) }, "a\n\nbbbbbb"),
      );
    });
    const nextList = renderer!.root.findByType("FlatList" as never);
    const nextKeys = (nextList.props.data as MarkdownNode[]).map(
      nextList.props.keyExtractor as (node: MarkdownNode, index: number) => string,
    );

    expect(nextKeys).toEqual(firstKeys);
    expect(nextKeys).toEqual(["paragraph:0", "paragraph:1"]);
  });
});
