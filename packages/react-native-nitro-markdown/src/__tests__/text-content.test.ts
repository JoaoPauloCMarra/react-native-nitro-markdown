import "./setup";
import type { MarkdownNode } from "../headless";
import { getFlattenedText, getTextContent } from "../headless";
import { readFlattenedText, readTextContent } from "../utils/text-content";

const table: MarkdownNode = {
  type: "document",
  children: [
    {
      type: "paragraph",
      children: [
        { type: "text", content: "Hello " },
        { type: "bold", children: [{ type: "text", content: "world" }] },
        { type: "soft_break" },
        { type: "image", alt: "alt text" },
      ],
    },
    {
      type: "code_block",
      children: [{ type: "text", content: "let a = 1;\n" }],
    },
  ],
};

describe("internal text readers", () => {
  it("match the public cloning readers on validated trees", () => {
    expect(readTextContent(table)).toBe(getTextContent(table));
    expect(readFlattenedText(table)).toBe(getFlattenedText(table));
  });

  it("stop on cyclic trees with a typed invalid_ast error", () => {
    const cyclic: MarkdownNode = { type: "paragraph", children: [] };
    cyclic.children!.push(cyclic);

    expect(() => readTextContent(cyclic)).toThrow(
      expect.objectContaining({ code: "invalid_ast" }),
    );
    expect(() => readFlattenedText(cyclic)).toThrow(
      expect.objectContaining({ code: "invalid_ast" }),
    );
  });
});
