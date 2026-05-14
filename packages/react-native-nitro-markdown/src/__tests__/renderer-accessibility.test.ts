import "./setup";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Markdown } from "../markdown";
import type { MarkdownNode } from "../headless";

jest.mock("../renderers/math", () => ({
  MathInline: "MathInline",
  MathBlock: "MathBlock",
}));

const sourceAst: MarkdownNode = {
  type: "document",
  children: [
    {
      type: "heading",
      level: 2,
      children: [{ type: "text", content: "Title" }],
    },
    {
      type: "paragraph",
      children: [
        {
          type: "link",
          href: "https://example.com",
          children: [{ type: "text", content: "Example" }],
        },
      ],
    },
    {
      type: "list",
      children: [
        {
          type: "task_list_item",
          checked: true,
          children: [{ type: "text", content: "Done" }],
        },
      ],
    },
    {
      type: "image",
      href: "javascript:alert(1)",
      alt: "Unsafe image",
    },
  ],
};

function renderMarkdown(ast: MarkdownNode, props: Record<string, unknown> = {}) {
  let renderer: ReactTestRenderer | null = null;
  const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});

  try {
    act(() => {
      renderer = create(
        createElement(Markdown, { sourceAst: ast, ...props }, "ignored"),
      );
    });
    return renderer!;
  } finally {
    consoleErrorSpy.mockRestore();
  }
}

describe("Markdown renderer accessibility", () => {
  it("wires semantic roles for built-in renderers", () => {
    const renderer = renderMarkdown(sourceAst);

    expect(
      renderer.root.findAll(
        (node) => node.type === "Text" && node.props.accessibilityRole === "header",
      ),
    ).toHaveLength(1);
    expect(
      renderer.root.findAll(
        (node) => node.type === "Text" && node.props.accessibilityRole === "link",
      ),
    ).toHaveLength(1);
    expect(
      renderer.root.findAll(
        (node) =>
          node.type === "View" &&
          node.props.accessibilityRole === "checkbox" &&
          node.props.accessibilityState?.checked === true,
      ),
    ).toHaveLength(1);
    expect(
      renderer.root.findAll(
        (node) =>
          node.type === "View" &&
          node.props.accessibilityRole === "image" &&
          node.props.accessibilityLabel === "Unsafe image",
      ),
    ).toHaveLength(1);
  });

  it("defaults clipped subview removal to false on iOS virtualization", () => {
    const children = Array.from({ length: 45 }, (_, index): MarkdownNode => ({
      type: "paragraph",
      children: [{ type: "text", content: `Paragraph ${index}` }],
    }));
    const renderer = renderMarkdown({ type: "document", children }, { virtualize: true });

    const list = renderer.root.findByType("FlatList");
    expect(list.props.removeClippedSubviews).toBe(false);
  });
});
