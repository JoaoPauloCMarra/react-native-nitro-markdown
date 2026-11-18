import { createElement, useEffect } from "react";
import {
  act,
  create,
  type ReactTestRenderer,
  type ReactTestRendererJSON,
} from "react-test-renderer";
import { Markdown, type MarkdownProps } from "../markdown";
import type { MarkdownNode } from "../headless";

const paragraph = (index: number): MarkdownNode => ({
  type: "paragraph",
  children: [{ type: "text", content: `p${index}` }],
});

const documentOf = (blocks: MarkdownNode[]): MarkdownNode => ({
  type: "document",
  children: blocks,
});

const paragraphs = (count: number): MarkdownNode[] =>
  Array.from({ length: count }, (_, index) => paragraph(index));

const isElement = (
  value: ReactTestRendererJSON | string,
): value is ReactTestRendererJSON => typeof value !== "string";

const documentChildren = (renderer: ReactTestRenderer): ReactTestRendererJSON[] => {
  const container = renderer.toJSON();
  if (container === null || Array.isArray(container)) {
    throw new Error("expected one container element");
  }
  const documentView = (container.children ?? []).filter(isElement)[0];
  if (!documentView) throw new Error("expected a document element");
  return (documentView.children ?? []).filter(isElement);
};

const childCounts = (elements: ReactTestRendererJSON[]): number[] =>
  elements.map((element) => (element.children ?? []).length);

const render = (props: Partial<MarkdownProps>): ReactTestRenderer => {
  let renderer: ReactTestRenderer | undefined;
  act(() => {
    renderer = create(createElement(Markdown, { children: "", ...props }));
  });
  return renderer!;
};

describe("document block groups", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("renders top-level blocks in groups of 32", () => {
    const renderer = render({ sourceAst: documentOf(paragraphs(70)) });

    const groups = documentChildren(renderer);
    expect(groups.map((group) => group.type)).toEqual(["View", "View", "View"]);
    expect(childCounts(groups)).toEqual([32, 32, 6]);
  });

  it("groups a short document too, so a growing document never changes tree shape", () => {
    const renderer = render({ sourceAst: documentOf(paragraphs(1)) });

    const groups = documentChildren(renderer);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.type).toBe("View");
    expect(childCounts(groups)).toEqual([1]);
  });

  it("renders only the new block when a block is appended", () => {
    const blocks = paragraphs(40);
    const paragraphRenders: string[] = [];
    const renderers: MarkdownProps["renderers"] = {
      paragraph: ({ node }) => {
        paragraphRenders.push(node.children?.[0]?.content ?? "");
        return undefined;
      },
    };
    const renderer = render({ sourceAst: documentOf(blocks), renderers });
    expect(paragraphRenders).toHaveLength(40);

    paragraphRenders.length = 0;
    act(() => {
      renderer.update(
        createElement(Markdown, {
          children: "",
          renderers,
          sourceAst: documentOf([...blocks, paragraph(40)]),
        }),
      );
    });

    expect(paragraphRenders).toEqual(["p40"]);
    expect(childCounts(documentChildren(renderer))).toEqual([32, 9]);
  });

  it("re-renders the group of a block that changed", () => {
    const blocks = paragraphs(40);
    const paragraphRenders: string[] = [];
    const renderers: MarkdownProps["renderers"] = {
      paragraph: ({ node }) => {
        paragraphRenders.push(node.children?.[0]?.content ?? "");
        return undefined;
      },
    };
    const renderer = render({ sourceAst: documentOf(blocks), renderers });

    paragraphRenders.length = 0;
    const changed = [...blocks];
    changed[3] = {
      type: "paragraph",
      children: [{ type: "text", content: "changed" }],
    };
    act(() => {
      renderer.update(
        createElement(Markdown, {
          children: "",
          renderers,
          sourceAst: documentOf(changed),
        }),
      );
    });

    expect(paragraphRenders).toEqual(["changed"]);
  });

  it("does not remount the first group when the document grows past it", () => {
    const blocks = paragraphs(32);
    const mounts: string[] = [];
    const unmounts: string[] = [];
    const MountProbe = ({ label }: { label: string }) => {
      useEffect(() => {
        mounts.push(label);
        return () => {
          unmounts.push(label);
        };
      }, [label]);
      return null;
    };
    const renderers: MarkdownProps["renderers"] = {
      paragraph: ({ node }) =>
        createElement(MountProbe, { label: node.children?.[0]?.content ?? "" }),
    };
    const renderer = render({ sourceAst: documentOf(blocks), renderers });
    expect(mounts).toHaveLength(32);
    expect(childCounts(documentChildren(renderer))).toEqual([0]);

    mounts.length = 0;
    act(() => {
      renderer.update(
        createElement(Markdown, {
          children: "",
          renderers,
          sourceAst: documentOf([...blocks, paragraph(32)]),
        }),
      );
    });

    expect(mounts).toEqual(["p32"]);
    expect(unmounts).toEqual([]);
    expect(documentChildren(renderer)).toHaveLength(2);
  });

  it("re-renders the blocks whose index shifted after an insert", () => {
    const blocks = paragraphs(40);
    const paragraphRenders: string[] = [];
    const renderers: MarkdownProps["renderers"] = {
      paragraph: ({ node }) => {
        paragraphRenders.push(node.children?.[0]?.content ?? "");
        return undefined;
      },
    };
    const renderer = render({ sourceAst: documentOf(blocks), renderers });

    paragraphRenders.length = 0;
    const inserted: MarkdownNode = {
      type: "paragraph",
      children: [{ type: "text", content: "inserted" }],
    };
    act(() => {
      renderer.update(
        createElement(Markdown, {
          children: "",
          renderers,
          sourceAst: documentOf([...blocks.slice(0, 5), inserted, ...blocks.slice(5)]),
        }),
      );
    });

    expect(paragraphRenders).toContain("inserted");
    expect(childCounts(documentChildren(renderer))).toEqual([32, 9]);
    const texts = renderer.root
      .findAllByType("Text" as never)
      .map((text) => [text.props.children].flat().join(""));
    expect(texts.slice(4, 8)).toEqual(["p4", "inserted", "p5", "p6"]);
    expect(texts).toHaveLength(41);
  });

  it("drops the last group when the document shrinks", () => {
    const blocks = paragraphs(40);
    const renderer = render({ sourceAst: documentOf(blocks) });
    expect(childCounts(documentChildren(renderer))).toEqual([32, 8]);

    act(() => {
      renderer.update(
        createElement(Markdown, {
          children: "",
          sourceAst: documentOf(blocks.slice(0, 31)),
        }),
      );
    });

    expect(childCounts(documentChildren(renderer))).toEqual([31]);
  });

  it("applies a theme change to blocks inside an unchanged group", () => {
    const ast = documentOf(paragraphs(40));
    const withTextColor = (color: string) =>
      createElement(Markdown, {
        children: "",
        sourceAst: ast,
        theme: { colors: { text: color } } as NonNullable<MarkdownProps["theme"]>,
      });
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(withTextColor("#010203"));
    });
    const firstBlockStyle = () =>
      JSON.stringify(renderer!.root.findAllByType("Text" as never)[0]!.props.style);
    expect(firstBlockStyle()).toContain("#010203");

    act(() => {
      renderer!.update(withTextColor("#0a0b0c"));
    });

    expect(firstBlockStyle()).toContain("#0a0b0c");
    expect(firstBlockStyle()).not.toContain("#010203");
  });

  it("keeps the flat tree when styles.document is set", () => {
    const renderer = render({
      sourceAst: documentOf(paragraphs(40)),
      styles: { document: { gap: 8 } },
    });

    const blocks = documentChildren(renderer);
    expect(blocks).toHaveLength(40);
    expect(blocks.every((block) => block.type === "Text")).toBe(true);
  });

  it("keeps the flat tree when a top-level child is inline", () => {
    const renderer = render({
      sourceAst: documentOf([
        paragraph(0),
        { type: "text", content: "loose text" },
        paragraph(1),
      ]),
    });

    const children = documentChildren(renderer);
    expect(children).toHaveLength(3);
    expect(children.every((child) => child.type === "Text")).toBe(true);
  });

  it("gives a custom document renderer the blocks without groups", () => {
    let received = 0;
    render({
      sourceAst: documentOf(paragraphs(40)),
      renderers: {
        document: ({ children }) => {
          received = Array.isArray(children) ? children.length : -1;
          return undefined;
        },
      },
    });

    expect(received).toBe(40);
  });
});
