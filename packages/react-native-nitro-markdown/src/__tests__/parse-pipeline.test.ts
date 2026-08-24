import type { MarkdownNode } from "../headless";
import type { MarkdownPlugin } from "../markdown";
import {
  applyAfterParsePlugins,
  applyBeforeParsePlugins,
  cloneMarkdownNode,
  getParserOptionsKey,
  hashString,
  isMarkdownNode,
  normalizeParserOptions,
  parseWithNativeParser,
  safeOnError,
  sortPluginsByPriority,
  warnInDev,
} from "../utils/parse-pipeline";
import {
  MAX_AST_DEPTH,
  MAX_AST_STRING_BYTES,
  freezeMarkdownNode,
} from "../utils/freeze-ast";
import { mockParser } from "./setup";

const ROOT_NODE: MarkdownNode = {
  type: "document",
  children: [{ type: "text", content: "original" }],
};

describe("parse pipeline utilities", () => {
  beforeEach(() => {
    mockParser.parse.mockClear();
    mockParser.parseWithOptions.mockClear();
  });

  it("hashes strings deterministically", () => {
    expect(hashString("")).toBe(0);
    expect(hashString("nitro")).toBe(hashString("nitro"));
    expect(hashString("nitro")).not.toBe(hashString("markdown"));
  });

  it("normalizes callback errors and contains callback failures", () => {
    const onError = jest.fn();
    safeOnError(onError, "failure", "parse");
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "failure" }),
      "parse",
      undefined,
    );

    const callbackError = new Error("callback failed");
    const warning = jest.spyOn(console, "warn").mockImplementation();
    safeOnError(
      () => {
        throw callbackError;
      },
      new Error("parse failed"),
      "parse",
      "plugin",
    );
    expect(warning).toHaveBeenCalledWith(
      "[NitroMarkdown] onError callback threw an exception:",
      callbackError,
    );
    warning.mockRestore();

    expect(() => safeOnError(undefined, "ignored", "parse")).not.toThrow();
  });

  it("validates and clones markdown nodes", () => {
    expect(isMarkdownNode(ROOT_NODE)).toBe(true);
    expect(isMarkdownNode({ type: 1 })).toBe(false);
    expect(isMarkdownNode(null)).toBe(false);
    expect(isMarkdownNode("document")).toBe(false);

    const clone = cloneMarkdownNode(ROOT_NODE);
    expect(clone).toEqual(ROOT_NODE);
    expect(clone).not.toBe(ROOT_NODE);
    expect(clone.children).not.toBe(ROOT_NODE.children);

    const leaf: MarkdownNode = { type: "text", content: "leaf" };
    expect(cloneMarkdownNode(leaf)).toEqual(leaf);
  });

  it("materializes proxy data properties before rendering can observe changes", () => {
    let content = "before";
    const proxy = new Proxy(
      { type: "text", content: "before" },
      {
        getOwnPropertyDescriptor(target, key) {
          const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
          if (key === "content" && descriptor && "value" in descriptor) {
            return { ...descriptor, value: content };
          }
          return descriptor;
        },
      },
    );

    const clone = cloneMarkdownNode(proxy);
    content = "after";

    expect(clone).toEqual({ type: "text", content: "before" });
    expect(Object.getPrototypeOf(clone)).toBe(Object.prototype);
  });

  it("bounds a proxy that changes values between validation and cloning", () => {
    const changingRoot = (
      field: "children" | "metadata",
      replacement: unknown,
    ): MarkdownNode => {
      let reads = 0;
      const target: Record<string, unknown> = {
        type: field === "children" ? "document" : "text",
        [field]: field === "children" ? [] : { values: [] },
      };
      return new Proxy(target, {
        getOwnPropertyDescriptor(source, key) {
          const descriptor = Reflect.getOwnPropertyDescriptor(source, key);
          if (key === field && descriptor && "value" in descriptor) {
            return {
              ...descriptor,
              value: reads++ < 2 ? descriptor.value : replacement,
            };
          }
          return descriptor;
        },
      }) as MarkdownNode;
    };
    const expectInvalid = (node: MarkdownNode): void => {
      expect(() => cloneMarkdownNode(node)).toThrow(
        expect.objectContaining({ code: "invalid_ast" }),
      );
    };

    expectInvalid(changingRoot("children", {}));
    expectInvalid(changingRoot("children", ["not-a-node"]));

    let deepNode: MarkdownNode = { type: "text", content: "leaf" };
    for (let index = 0; index <= MAX_AST_DEPTH; index += 1) {
      deepNode = { type: "paragraph", children: [deepNode] };
    }
    expectInvalid(changingRoot("children", [deepNode]));

    const metadataArray = [] as unknown[] & { extra?: boolean };
    Object.defineProperty(metadataArray, "extra", {
      configurable: true,
      enumerable: true,
      value: true,
    });
    expectInvalid(
      changingRoot("metadata", { values: metadataArray }),
    );

    const manyNodes = Array.from({ length: 100_001 }, () => ({
      type: "text" as const,
      content: "x",
    }));
    expectInvalid(changingRoot("children", manyNodes));
  });

  it("validates the documented node fields and JSON-like metadata iteratively", () => {
    const metadata = {
      nullValue: null,
      undefinedValue: undefined,
      booleanValue: true,
      numberValue: 42,
      stringValue: "é",
      nested: { emoji: "😀" },
      values: [{ nestedValue: false }],
    };
    const child = {
      type: "heading" as const,
      content: "heading",
      level: 3,
      href: "https://example.com",
      title: "title",
      alt: "alt",
      language: "typescript",
      ordered: true,
      start: 2,
      checked: false,
      isHeader: true,
      align: "center" as const,
      beg: 0,
      end: 7,
      metadata,
    };
    const root = {
      type: "document" as const,
      content: undefined,
      level: undefined,
      href: undefined,
      title: undefined,
      alt: undefined,
      language: undefined,
      ordered: undefined,
      start: undefined,
      checked: undefined,
      isHeader: undefined,
      align: "right" as const,
      beg: undefined,
      end: undefined,
      children: [child],
      metadata,
    } as MarkdownNode & { metadata: typeof metadata };

    expect(() => freezeMarkdownNode(root)).not.toThrow();
    expect(Object.isFrozen(root)).toBe(true);
    expect(Object.isFrozen(metadata.nested)).toBe(true);
    expect(Object.isFrozen(metadata.values)).toBe(true);
    expect(Object.isFrozen(metadata.values[0])).toBe(true);

    const clone = cloneMarkdownNode(root);
    expect(clone).not.toBe(root);
    expect(clone.children?.[0]).not.toBe(child);
    expect((clone as typeof root).metadata).not.toBe(metadata);
    expect((clone as typeof root).metadata.nested).not.toBe(metadata.nested);
    expect((clone as typeof root).metadata.values).not.toBe(metadata.values);
    expect((clone as typeof root).metadata.values[0]).not.toBe(
      metadata.values[0],
    );
  });

  it("rejects invalid scalar, property, metadata, and array shapes", () => {
    const expectInvalid = (node: unknown) => {
      expect(() => freezeMarkdownNode(node as MarkdownNode)).toThrow(
        expect.objectContaining({ code: "invalid_ast" }),
      );
    };

    expectInvalid({ type: "text", content: 1 });
    expectInvalid({ type: "text", level: 0 });
    expectInvalid({ type: "text", level: 7 });
    expectInvalid({ type: "text", ordered: "yes" });
    expectInvalid({ type: "text", start: -1 });
    expectInvalid({ type: "text", start: Number.NaN });
    expectInvalid({ type: "text", align: "justify" });
    expect(() =>
      freezeMarkdownNode({ type: "text", content: "\ue000" }),
    ).not.toThrow();
    expect(() =>
      freezeMarkdownNode({ type: "text", content: "\ud800" }),
    ).not.toThrow();
    expectInvalid({
      type: "text",
      content: "a".repeat(MAX_AST_STRING_BYTES + 1),
    });
    expectInvalid({ type: "text", metadata: Symbol("metadata") });
    expectInvalid({ type: "document", children: ["not-a-node"] });
    expectInvalid({ type: "text", metadata: { values: [Symbol("value")] } });
    expectInvalid({ type: "text", metadata: { values: [() => "value"] } });
    expectInvalid({ type: "text", metadata: { value: Number.NaN } });
    expectInvalid({ type: "text", metadata: { value: 1n } });
    expectInvalid({ type: "text", metadata: new Date() });

    const symbolKeyNode = { type: "text" } as Record<PropertyKey, unknown>;
    Object.defineProperty(symbolKeyNode, Symbol("unexpected"), {
      enumerable: true,
      value: true,
    });
    expectInvalid(symbolKeyNode);

    const longKeyNode = { type: "text" } as Record<string, unknown>;
    longKeyNode["k".repeat(257)] = true;
    expectInvalid(longKeyNode);

    expectInvalid({
      type: "text",
      metadata: { ["k".repeat(257)]: true },
    });

    const nonIndexedArray = [] as unknown[] & { extra?: boolean };
    nonIndexedArray.extra = true;
    expectInvalid({ type: "document", children: nonIndexedArray });

    const sparseArray = new Array<MarkdownNode>(1);
    expectInvalid({ type: "document", children: sparseArray });

    const revokedMetadata = Proxy.revocable({}, {});
    revokedMetadata.revoke();
    expectInvalid({ type: "document", metadata: revokedMetadata.proxy });

    const throwingKeys = new Proxy(
      { type: "text" },
      { ownKeys: () => { throw new Error("keys"); } },
    );
    expectInvalid(throwingKeys);

    const throwingProperty = new Proxy(
      { type: "text" },
      { getOwnPropertyDescriptor: () => { throw new Error("property"); } },
    );
    expectInvalid(throwingProperty);

    const throwingFreeze = new Proxy(
      { type: "text" },
      { preventExtensions: () => { throw new Error("freeze"); } },
    );
    expectInvalid(throwingFreeze);

    const maxString = "a".repeat(MAX_AST_STRING_BYTES);
    expectInvalid({
      type: "document",
      children: Array.from({ length: 9 }, () => ({
        type: "text" as const,
        content: maxString,
      })),
    });
  });

  it("rejects incompatible shared roles and aggregate array work", () => {
    const shared = { type: "text", content: "shared" } as MarkdownNode & {
      metadata?: unknown;
    };
    expect(() =>
      freezeMarkdownNode({
        type: "document",
        children: [shared],
        metadata: { shared },
      } as MarkdownNode),
    ).toThrow(expect.objectContaining({ code: "invalid_ast" }));

    const sharedLeaf = { type: "text", content: "shared" };
    const largeChildren = new Array<MarkdownNode>(125_001).fill(sharedLeaf);
    const secondChildren = new Array<MarkdownNode>(125_001).fill(sharedLeaf);
    expect(() =>
      freezeMarkdownNode({
        type: "document",
        children: [
          { type: "paragraph", children: largeChildren },
          { type: "paragraph", children: secondChildren },
        ],
      }),
    ).toThrow(expect.objectContaining({ code: "invalid_ast" }));
  });

  it("freezes shared DAG nodes once without mistaking them for cycles", () => {
    const shared: MarkdownNode = { type: "text", content: "shared" };
    const root: MarkdownNode = {
      type: "document",
      children: [shared, shared],
    };

    expect(freezeMarkdownNode(root)).toBe(root);
    expect(Object.isFrozen(root)).toBe(true);
    expect(Object.isFrozen(root.children)).toBe(true);
    expect(Object.isFrozen(shared)).toBe(true);
  });

  it("rejects cycles during AST freezing without recursing forever", () => {
    const root = {
      type: "document" as const,
      children: [] as MarkdownNode[],
    };
    root.children.push(root as unknown as MarkdownNode);

    expect(() => freezeMarkdownNode(root as MarkdownNode)).toThrow(
      expect.objectContaining({ code: "invalid_ast" }),
    );
  });

  it("freezes a deep AST and reachable metadata without using the call stack", () => {
    const metadataTags = ["shared"];
    const metadata = { tags: metadataTags };
    const nodes: MarkdownNode[] = [{ type: "text", content: "leaf" }];
    for (let index = 0; index < MAX_AST_DEPTH - 2; index += 1) {
      nodes.push({ type: "paragraph", children: [nodes[nodes.length - 1]!] });
    }
    const root = {
      type: "document" as const,
      children: [nodes[nodes.length - 1]!],
      metadata,
    } as MarkdownNode & { metadata: typeof metadata };

    expect(() => freezeMarkdownNode(root)).not.toThrow();
    expect(Object.isFrozen(root)).toBe(true);
    expect(Object.isFrozen(root.children)).toBe(true);
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(Object.isFrozen(metadataTags)).toBe(true);
    expect(Object.isFrozen(nodes[0])).toBe(true);
    expect(Object.isFrozen(nodes[nodes.length - 1])).toBe(true);
  });

  it("rejects a deep indirect AST cycle with invalid_ast instead of RangeError", () => {
    const root: MarkdownNode = { type: "document", children: [] };
    let current = root;
    for (let index = 0; index < 16_384; index += 1) {
      const next: MarkdownNode = { type: "paragraph", children: [] };
      current.children!.push(next);
      current = next;
    }
    current.children!.push(root);

    expect(() => freezeMarkdownNode(root)).toThrow(
      expect.objectContaining({ code: "invalid_ast" }),
    );
  });

  it("rejects malformed AST object and children values with invalid_ast", () => {
    expect(() => freezeMarkdownNode(null as unknown as MarkdownNode)).toThrow(
      expect.objectContaining({ code: "invalid_ast" }),
    );
    expect(() =>
      freezeMarkdownNode({
        type: "document",
        children: "not-an-array",
      } as unknown as MarkdownNode),
    ).toThrow(expect.objectContaining({ code: "invalid_ast" }));
  });

  it("rejects unknown and missing node types with invalid_ast", () => {
    expect(() => freezeMarkdownNode({} as MarkdownNode)).toThrow(
      expect.objectContaining({ code: "invalid_ast" }),
    );
    expect(() => freezeMarkdownNode({ type: "unknown" } as MarkdownNode)).toThrow(
      expect.objectContaining({ code: "invalid_ast" }),
    );
  });

  it("rejects over-depth and oversized arrays before traversal work", () => {
    let node: MarkdownNode = { type: "text", content: "leaf" };
    for (let index = 0; index <= MAX_AST_DEPTH; index += 1) {
      node = { type: "paragraph", children: [node] };
    }
    expect(() => freezeMarkdownNode(node)).toThrow(
      expect.objectContaining({ code: "invalid_ast" }),
    );
    expect(() =>
      freezeMarkdownNode({
        type: "document",
        children: new Array(1_000_001),
      } as unknown as MarkdownNode),
    ).toThrow(expect.objectContaining({ code: "invalid_ast" }));
  });

  it("rejects AST accessors before any render consumer can invoke them", () => {
    const root = { type: "document" } as MarkdownNode & {
      children?: MarkdownNode[];
    };
    Object.defineProperty(root, "children", {
      enumerable: true,
      get: () => undefined,
    });

    expect(() => freezeMarkdownNode(root)).toThrow(
      expect.objectContaining({ code: "invalid_ast" }),
    );
  });

  it("normalizes an uninspectable AST value to invalid_ast", () => {
    const revoked = Proxy.revocable([], {});
    revoked.revoke();
    expect(() =>
      freezeMarkdownNode({
        type: "document",
        children: revoked.proxy as unknown as MarkdownNode[],
      } as MarkdownNode),
    ).toThrow(expect.objectContaining({ code: "invalid_ast" }));
  });

  it("builds stable parser option keys", () => {
    expect(getParserOptionsKey()).toContain("gfm:default");
    expect(getParserOptionsKey({})).toContain("maxInputLength:default");
    expect(
      getParserOptionsKey({
        gfm: true,
        math: false,
        html: true,
        sourceOffsets: false,
        maxInputLength: 42,
      }),
    ).toBe("gfm:1|math:0|html:1|sourceOffsets:0|maxInputLength:42");
  });

  it("removes empty parser options and preserves explicit values", () => {
    expect(normalizeParserOptions()).toBeUndefined();
    expect(normalizeParserOptions({})).toBeUndefined();
    expect(
      normalizeParserOptions({
        gfm: false,
        math: true,
        html: false,
        sourceOffsets: false,
        maxInputLength: 100,
      }),
    ).toEqual({
      gfm: false,
      math: true,
      html: false,
      sourceOffsets: false,
      maxInputLength: 100,
    });
  });

  it("selects the correct native parser entrypoint", () => {
    parseWithNativeParser("plain");
    expect(mockParser.parse).toHaveBeenCalledWith("plain");

    parseWithNativeParser("configured", { html: true });
    expect(mockParser.parseWithOptions).toHaveBeenCalledWith("configured", {
      html: true,
    });
  });

  it("sorts plugins by descending priority without mutating input", () => {
    expect(sortPluginsByPriority()).toBeUndefined();
    expect(sortPluginsByPriority([])).toBeUndefined();

    const plugins: MarkdownPlugin[] = [
      { name: "default" },
      { name: "high", priority: 10 },
      { name: "low", priority: -1 },
    ];
    expect(sortPluginsByPriority(plugins)?.map((plugin) => plugin.name)).toEqual(
      ["high", "default", "low"],
    );
    expect(plugins.map((plugin) => plugin.name)).toEqual([
      "default",
      "high",
      "low",
    ]);
  });

  it("applies before-parse plugins and contains invalid results", () => {
    const onError = jest.fn();
    const warning = jest.spyOn(console, "warn").mockImplementation();
    const plugins: MarkdownPlugin[] = [
      { name: "noop" },
      { name: "invalid", beforeParse: () => 12 as unknown as string },
      { name: "transform", beforeParse: (value) => `${value}-changed` },
      {
        name: "throws",
        beforeParse: () => {
          throw new Error("before failed");
        },
      },
    ];

    expect(applyBeforeParsePlugins("original")).toBe("original");
    expect(applyBeforeParsePlugins("original", [])).toBe("original");
    expect(applyBeforeParsePlugins("original", plugins, onError)).toBe(
      "original-changed",
    );
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "before failed" }),
      "before-plugin",
      "throws",
    );
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });

  it("applies after-parse plugins and contains invalid results", () => {
    const replacement: MarkdownNode = {
      type: "document",
      children: [{ type: "text", content: "replacement" }],
    };
    const onError = jest.fn();
    const warning = jest.spyOn(console, "warn").mockImplementation();
    const plugins: MarkdownPlugin[] = [
      { name: "noop" },
      { name: "invalid", afterParse: () => ({ invalid: true }) as MarkdownNode },
      { name: "transform", afterParse: () => replacement },
      {
        afterParse: () => {
          throw new Error("after failed");
        },
      },
    ];

    expect(applyAfterParsePlugins(ROOT_NODE)).toBe(ROOT_NODE);
    expect(applyAfterParsePlugins(ROOT_NODE, [])).toBe(ROOT_NODE);
    const transformed = applyAfterParsePlugins(ROOT_NODE, plugins, onError);
    expect(transformed).toEqual(replacement);
    expect(transformed).not.toBe(replacement);
    expect(Object.isFrozen(transformed)).toBe(true);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: "after failed" }),
      "after-plugin",
      undefined,
    );
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });

  it("warns through the runtime console in development", () => {
    const warning = jest.spyOn(console, "warn").mockImplementation();
    const error = new Error("warning");
    warnInDev("message", error);
    expect(warning).toHaveBeenCalledWith("message", error);
    warning.mockRestore();
  });
});
