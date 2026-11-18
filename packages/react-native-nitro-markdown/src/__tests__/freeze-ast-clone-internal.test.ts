import type { MarkdownNode } from "../headless";
import {
  cloneInternalAst,
  type InternalAstCloneCache,
} from "../utils/freeze-ast";

const text = (content: string): MarkdownNode => ({ type: "text", content });
const paragraph = (content: string): MarkdownNode => ({
  type: "paragraph",
  children: [text(content)],
});
const newCache = (): InternalAstCloneCache => new WeakMap();

const collect = (node: MarkdownNode, out: object[] = []): object[] => {
  out.push(node);
  if (node.children) {
    out.push(node.children);
    for (const child of node.children) collect(child, out);
  }
  return out;
};

describe("cloneInternalAst", () => {
  it("copies structure without sharing node or children objects", () => {
    const source: MarkdownNode = {
      type: "document",
      children: [paragraph("a"), paragraph("b")],
    };
    const clone = cloneInternalAst(source, newCache());

    expect(clone).toEqual(source);
    const sourceObjects = new Set(collect(source));
    for (const object of collect(clone)) {
      expect(sourceObjects.has(object)).toBe(false);
    }
  });

  it("returns the identical clone for the same source node and cache", () => {
    const source = paragraph("a");
    const cache = newCache();
    expect(cloneInternalAst(source, cache)).toBe(
      cloneInternalAst(source, cache),
    );
  });

  it("reuses cached child clones under a new root", () => {
    const first = paragraph("a");
    const second = paragraph("b");
    const cache = newCache();
    const oldRoot: MarkdownNode = { type: "document", children: [first] };
    const oldClone = cloneInternalAst(oldRoot, cache);
    const newRoot: MarkdownNode = {
      type: "document",
      children: [first, second],
    };
    const newClone = cloneInternalAst(newRoot, cache);

    expect(newClone).not.toBe(oldClone);
    expect(newClone.children?.[0]).toBe(oldClone.children?.[0]);
    expect(newClone.children).toHaveLength(2);
    expect(newClone.children?.[1]).not.toBe(second);
  });

  it("gives each cache its own clone of the same source node", () => {
    const source = paragraph("a");
    const first = cloneInternalAst(source, newCache());
    const second = cloneInternalAst(source, newCache());
    expect(second).not.toBe(first);
    expect(second.children?.[0]).not.toBe(first.children?.[0]);
  });

  it("isolates mutations of a clone from the source", () => {
    const source = paragraph("a");
    const clone = cloneInternalAst(source, newCache());
    clone.children![0]!.content = "changed";
    expect(source.children![0]!.content).toBe("a");
  });
});
