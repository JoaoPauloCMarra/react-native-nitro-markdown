import "./setup";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Markdown } from "../markdown";
import type { MarkdownNode } from "../headless";
import { mockParser } from "./setup";

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
    {
      type: "horizontal_rule",
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
    expect(
      renderer.root.findAll(
        (node) =>
          node.type === "View" &&
          node.props.accessibilityElementsHidden === true &&
          node.props.importantForAccessibility === "no-hide-descendants",
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

  it("labels tables with a grid role and header summary", () => {
    const tableAst: MarkdownNode = {
      type: "document",
      children: [
        {
          type: "table",
          children: [
            {
              type: "table_head",
              children: [
                {
                  type: "table_row",
                  children: [
                    {
                      type: "table_cell",
                      isHeader: true,
                      children: [{ type: "text", content: "Name" }],
                    },
                    {
                      type: "table_cell",
                      isHeader: true,
                      children: [{ type: "text", content: "Age" }],
                    },
                  ],
                },
              ],
            },
            {
              type: "table_body",
              children: [
                {
                  type: "table_row",
                  children: [
                    {
                      type: "table_cell",
                      children: [{ type: "text", content: "Ada" }],
                    },
                    {
                      type: "table_cell",
                      children: [{ type: "text", content: "36" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };

    const renderer = renderMarkdown(tableAst);
    const grid = renderer.root.find(
      (node) => node.type === "View" && node.props.role === "grid",
    );
    expect(grid.props.accessibilityLabel).toBe("Table: Name, Age");
  });

  it("cleans markdown markers from image accessibility labels", () => {
    const imageAst: MarkdownNode = {
      type: "document",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "image",
              href: "javascript:alert(1)",
              alt: "**Bold** `code` _italic_",
            },
          ],
        },
      ],
    };

    const renderer = renderMarkdown(imageAst);
    const image = renderer.root.find(
      (node) =>
        node.type === "View" && node.props.accessibilityRole === "image",
    );
    expect(image.props.accessibilityLabel).toBe("Bold code italic");
  });

  it("renders a custom errorText when parsing fails", () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    try {
      const parseError = new Error("mock parse failure");
      jest
        .spyOn(mockParser, "parse")
        .mockImplementationOnce(() => {
          throw parseError;
        });

      let renderer: ReactTestRenderer | null = null;
      act(() => {
        renderer = create(
          createElement(
            Markdown,
            { errorText: "Fehler beim Parsen" },
            "# Broken",
          ),
        );
      });

      const errorText = renderer!.root.findAll(
        (node) => node.type === "Text" && node.props.children === "Fehler beim Parsen",
      );
      expect(errorText).toHaveLength(1);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("passes native-shaped math content through without stripping", () => {
    const mathAst: MarkdownNode = {
      type: "document",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "math_inline",
              children: [{ type: "text", content: "x^2" }],
            },
          ],
        },
      ],
    };

    const renderer = renderMarkdown(mathAst);
    const mathNodes = renderer.root.findAllByType("MathInline");
    expect(mathNodes).toHaveLength(1);
    expect(mathNodes[0].props.content).toBe("x^2");
  });

  it("strips dollar delimiters only when a non-native shape includes them", () => {
    const mathAst: MarkdownNode = {
      type: "document",
      children: [
        {
          type: "paragraph",
          children: [
            {
              type: "math_inline",
              children: [{ type: "text", content: "$x^2$" }],
            },
          ],
        },
      ],
    };

    const renderer = renderMarkdown(mathAst);
    const mathNodes = renderer.root.findAllByType("MathInline");
    expect(mathNodes[0].props.content).toBe("x^2");
  });
});
