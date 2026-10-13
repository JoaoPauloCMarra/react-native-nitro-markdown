import "./setup";
import { createElement, type ReactNode } from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { Markdown } from "../markdown";
import type { MarkdownNode } from "../headless";
import { defaultMarkdownTheme } from "../theme";
import { hostType } from "./host-type";

const cell = (content: string, isHeader = false, align?: "right"): MarkdownNode => ({
  type: "table_cell",
  isHeader,
  ...(align ? { align } : {}),
  children: [{ type: "text", content }],
});

const tableAst = (): MarkdownNode => ({
  type: "document",
  children: [
    {
      type: "table",
      children: [
        {
          type: "table_head",
          children: [
            { type: "table_row", children: [cell("Name", true), cell("Qty", true, "right")] },
          ],
        },
        {
          type: "table_body",
          children: [
            { type: "table_row", children: [cell("Apple"), cell("3", false, "right")] },
            { type: "table_row", children: [cell("Pear"), cell("5", false, "right")] },
          ],
        },
      ],
    },
  ],
});

const mounted: ReactTestRenderer[] = [];

afterEach(() => {
  for (const renderer of mounted.splice(0)) {
    act(() => renderer.unmount());
  }
});

function renderMarkdown(
  ast: MarkdownNode,
  props: Record<string, unknown> = {},
): ReactTestRenderer {
  let renderer: ReactTestRenderer | null = null;
  const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  try {
    act(() => {
      renderer = create(
        createElement(Markdown, { sourceAst: ast, ...props, children: "ignored" }),
      );
    });
    mounted.push(renderer!);
    return renderer!;
  } finally {
    consoleErrorSpy.mockRestore();
  }
}

const textOf = (node: ReactTestInstance | string): string =>
  typeof node === "string" ? node : node.children.map(textOf).join("");

const textNodesWith = (renderer: ReactTestRenderer, text: string) =>
  renderer.root.findAll(
    (node) => node.type === hostType("Text") && textOf(node) === text,
  );

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign(
    {},
    ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean),
  );

describe("table renderer", () => {
  it("invokes custom table part renderers", () => {
    const calls: Record<string, number> = {};
    const track =
      (type: string) =>
      ({ children }: { children?: ReactNode }) => {
        calls[type] = (calls[type] ?? 0) + 1;
        return children;
      };
    renderMarkdown(tableAst(), {
      renderers: {
        table_cell: track("table_cell"),
        table_row: track("table_row"),
        table_head: track("table_head"),
        table_body: track("table_body"),
      },
    });

    expect(calls["table_cell"]).toBeGreaterThanOrEqual(6);
    expect(calls["table_row"]).toBeGreaterThanOrEqual(3);
    expect(calls["table_head"]).toBeGreaterThanOrEqual(1);
    expect(calls["table_body"]).toBeGreaterThanOrEqual(1);
  });

  it("lets a custom table_cell replace the cell content", () => {
    const renderer = renderMarkdown(tableAst(), {
      renderers: {
        table_cell: ({ node }: { node: MarkdownNode }) =>
          createElement("Text", null, `cell:${node.children?.[0]?.content ?? ""}`),
      },
    });

    expect(textNodesWith(renderer, "cell:Apple")).toHaveLength(1);
  });

  it("drops the rows when a custom table_row renderer does not render children", () => {
    const renderer = renderMarkdown(tableAst(), {
      renderers: {
        table_row: () => createElement("Text", null, "dropped"),
      },
    });

    expect(textNodesWith(renderer, "dropped")).toHaveLength(3);
    expect(textNodesWith(renderer, "Apple")).toHaveLength(0);
    expect(textNodesWith(renderer, "Name")).toHaveLength(0);
  });

  it("keeps the default rows when a custom table_row renderer returns undefined", () => {
    const renderer = renderMarkdown(tableAst(), {
      renderers: { table_row: () => undefined },
    });

    expect(textNodesWith(renderer, "Apple")).toHaveLength(1);
    expect(textNodesWith(renderer, "Name")).toHaveLength(1);
  });

  it("applies header text style and colour to real header cells", () => {
    const renderer = renderMarkdown(tableAst());
    const header = textNodesWith(renderer, "Name");
    expect(header.length).toBeGreaterThan(0);
    const style = flatten(header[0]!.props.style);
    expect(style["fontWeight"]).toBe("600");
    expect(style["color"]).toBe(defaultMarkdownTheme.colors.tableHeaderText);
    expect(style["fontSize"]).toBe(12);
  });

  it("applies body cell text style to real body cells", () => {
    const renderer = renderMarkdown(tableAst());
    const body = textNodesWith(renderer, "Apple");
    expect(body.length).toBeGreaterThan(0);
    const style = flatten(body[0]!.props.style);
    expect(style["fontSize"]).toBe(14);
    expect(style["lineHeight"]).toBe(20);
  });

  it("applies list_item, table_row and table_cell style overrides", () => {
    const ast: MarkdownNode = {
      type: "document",
      children: [
        {
          type: "list",
          children: [
            { type: "list_item", children: [{ type: "text", content: "one" }] },
          ],
        },
        ...(tableAst().children ?? []),
      ],
    };
    const renderer = renderMarkdown(ast, {
      styles: {
        list_item: { opacity: 0.5 },
        table_row: { opacity: 0.6 },
        table_cell: { opacity: 0.7 },
        table_head: { opacity: 0.8 },
        table_body: { opacity: 0.9 },
      },
    });
    const opacities = new Set(
      renderer.root
        .findAll((node) => node.type === hostType("View"))
        .map((node) => flatten(node.props.style)["opacity"]),
    );
    expect([0.5, 0.6, 0.7, 0.8, 0.9].every((value) => opacities.has(value))).toBe(true);
  });
});
