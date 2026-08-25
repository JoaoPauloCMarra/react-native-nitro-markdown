import { MarkdownError } from "../errors";
import { parseMarkdownForRender } from "../utils/render-parser";
import { mockParser } from "./setup";

describe("parseMarkdownForRender", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses the native parser without materializing a public clone", () => {
    const ast = parseMarkdownForRender("hello");

    expect(ast.type).toBe("document");
    expect(ast.children?.[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "text", content: "hello" }],
    });
    expect(mockParser.parse).toHaveBeenCalledWith("hello");
  });

  it("uses the native options parser without materializing a public clone", () => {
    parseMarkdownForRender("hello", { gfm: false, sourceOffsets: false });

    expect(mockParser.parseWithOptions).toHaveBeenCalledWith("hello", {
      gfm: false,
      sourceOffsets: false,
    });
  });

  it("keeps the public validated parser for frozen ASTs", () => {
    const ast = parseMarkdownForRender("hello", { freezeAst: true });

    expect(Object.isFrozen(ast)).toBe(true);
    expect(mockParser.parseWithOptions).toHaveBeenCalledWith("hello", {
      freezeAst: true,
    });
  });

  it("rejects malformed native roots and JSON", () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    mockParser.parse.mockImplementationOnce(() => "[]");
    expect(() => parseMarkdownForRender("bad root")).toThrow(
      expect.objectContaining({ code: "invalid_json" }),
    );

    mockParser.parse.mockImplementationOnce(() => "{");
    expect(() => parseMarkdownForRender("bad json")).toThrow(
      expect.objectContaining({ code: "invalid_json" }),
    );
    consoleErrorSpy.mockRestore();
  });

  it("maps native parser failures to MarkdownError", () => {
    const error = new Error("native failure");
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    mockParser.parse.mockImplementationOnce(() => {
      throw error;
    });

    expect(() => parseMarkdownForRender("failure")).toThrow(
      expect.objectContaining({ code: "parse_failed", source: "parse" }),
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[NitroMarkdown] parseMarkdownForRender: native parser failed.",
      error,
    );
    consoleErrorSpy.mockRestore();
  });

  it("reports a missing native parser", () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
    jest.resetModules();
    jest.doMock("react-native-nitro-modules", () => ({
      NitroModules: {
        createHybridObject: () => {
          throw new Error("native module missing");
        },
      },
    }));

    jest.isolateModules(() => {
      const isolated = require("../utils/render-parser") as typeof import("../utils/render-parser");
      expect(() => isolated.parseMarkdownForRender("missing")).toThrow(
        expect.objectContaining<Partial<MarkdownError>>({
          code: "native_unavailable",
          source: "parse",
        }),
      );
    });

    jest.dontMock("react-native-nitro-modules");
    jest.resetModules();
    consoleErrorSpy.mockRestore();
  });
});
