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
    expect(applyAfterParsePlugins(ROOT_NODE, plugins, onError)).toBe(
      replacement,
    );
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
