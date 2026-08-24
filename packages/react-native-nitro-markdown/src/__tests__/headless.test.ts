import { mockParser } from "./setup";
import type { MarkdownNode } from "../headless";
import {
  parseMarkdown,
  parseMarkdownWithOptions,
  extractPlainText,
  extractPlainTextWithOptions,
  getTextContent,
  getFlattenedText,
  stripSourceOffsets,
} from "../headless";

describe("parseMarkdown", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns a document node", () => {
    const ast = parseMarkdown("hello");
    expect(ast.type).toBe("document");
    expect(mockParser.parse).toHaveBeenCalledWith("hello");
  });

  it("delegates to parseWithOptions when options provided", () => {
    parseMarkdownWithOptions("hello", { gfm: true, html: true });
    expect(mockParser.parseWithOptions).toHaveBeenCalledWith("hello", {
      gfm: true,
      html: true,
    });
  });

  it("overloaded parseMarkdown forwards options", () => {
    parseMarkdown("hello", { math: true });
    expect(mockParser.parseWithOptions).toHaveBeenCalledWith("hello", { math: true });
  });

  it("handles empty input", () => {
    const ast = parseMarkdown("");
    expect(ast.type).toBe("document");
    expect(ast.children).toEqual([]);
  });
});

describe("extractPlainText", () => {
  beforeEach(() => jest.clearAllMocks());

  it("uses native extractPlainText", () => {
    const result = extractPlainText("# Title");
    expect(mockParser.extractPlainText).toHaveBeenCalledWith("# Title");
    expect(result).toBe("# Title");
  });

  it("uses native extractPlainTextWithOptions", () => {
    const result = extractPlainTextWithOptions("# Title", { gfm: true });
    expect(mockParser.extractPlainTextWithOptions).toHaveBeenCalledWith("# Title", { gfm: true });
    expect(result).toBe("# Title");
  });
});

describe("headless native fallback", () => {
  const runWithParserMock = (
    createHybridObject: () => unknown,
    callback: (headless: typeof import("../headless")) => void,
  ) => {
    jest.resetModules();
    jest.doMock("react-native-nitro-modules", () => ({
      NitroModules: { createHybridObject },
    }));

    jest.isolateModules(() => {
      callback(require("../headless") as typeof import("../headless"));
    });

    jest.dontMock("react-native-nitro-modules");
    jest.resetModules();
  };

  it("throws when the native parser cannot be created", () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    runWithParserMock(
      () => {
        throw new Error("native module missing");
      },
      (headless) => {
        expect(() => headless.parseMarkdown("# Missing")).toThrow(
          "native parser unavailable",
        );
        expect(() =>
          headless.parseMarkdownWithOptions("# Missing", { gfm: true }),
        ).toThrow("native parser unavailable");
        expect(() => headless.extractPlainText("# Missing")).toThrow(
          "native parser unavailable",
        );
        expect(() =>
          headless.extractPlainTextWithOptions("# Missing", { math: true }),
        ).toThrow("native parser unavailable");
      },
    );

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("falls back through the native AST when extract methods are unavailable", () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    runWithParserMock(
      () => ({
        parse: jest.fn(() =>
          JSON.stringify({
            type: "document",
            children: [
              {
                type: "code_block",
                children: [{ type: "text", content: "const fallback = true;" }],
              },
            ],
          }),
        ),
        parseWithOptions: jest.fn(() =>
          JSON.stringify({
            type: "document",
            children: [
              {
                type: "heading",
                children: [{ type: "text", content: "Fallback title" }],
              },
            ],
          }),
        ),
      }),
      (headless) => {
        expect(
          headless.extractPlainText("```ts\nconst fallback = true;\n```"),
        ).toBe("const fallback = true;\n\n");
        expect(
          headless.extractPlainTextWithOptions("# Fallback title", {
            gfm: true,
          }),
        ).toBe("Fallback title\n\n");
      },
    );

    consoleErrorSpy.mockRestore();
  });

  it("propagates native parser and invalid JSON failures as typed errors", () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    runWithParserMock(
      () => ({
        parse: jest.fn(() => {
          throw new Error("parse failed");
        }),
        parseWithOptions: jest.fn(() => "{invalid-json"),
        extractPlainText: jest.fn(() => {
          throw new Error("extract failed");
        }),
        extractPlainTextWithOptions: jest.fn(() => {
          throw new Error("extract with options failed");
        }),
      }),
      (headless) => {
        const expectCode = (
          fn: () => unknown,
          code: string,
          source: string,
        ) => {
          let caught: unknown;
          try {
            fn();
          } catch (error) {
            caught = error;
          }
          expect(caught).toBeInstanceOf(headless.MarkdownError);
          const markdownError = caught as InstanceType<
            typeof headless.MarkdownError
          >;
          expect(markdownError.code).toBe(code);
          expect(markdownError.source).toBe(source);
        };

        expectCode(() => headless.parseMarkdown("# Broken"), "parse_failed", "parse");
        expectCode(
          () => headless.parseMarkdownWithOptions("# Broken", { gfm: true }),
          "invalid_json",
          "parse",
        );
        expectCode(
          () => headless.extractPlainText("# Broken"),
          "parse_failed",
          "parse",
        );
        expectCode(
          () =>
            headless.extractPlainTextWithOptions("# Broken", { gfm: true }),
          "invalid_json",
          "parse",
        );
      },
    );

    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("rejects inputs above the maximum length with a typed error", () => {
    const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();

    runWithParserMock(
      () => ({
        parse: jest.fn(() => JSON.stringify({ type: "document" })),
        parseWithOptions: jest.fn(() => JSON.stringify({ type: "document" })),
        extractPlainText: jest.fn(() => ""),
        extractPlainTextWithOptions: jest.fn(() => ""),
      }),
      (headless) => {
        const oversized = "x".repeat(headless.MAX_PARSE_INPUT_LENGTH + 1);
        const expectInputTooLarge = (fn: () => unknown) => {
          let caught: unknown;
          try {
            fn();
          } catch (error) {
            caught = error;
          }
          expect(caught).toBeInstanceOf(headless.MarkdownError);
          const markdownError = caught as InstanceType<
            typeof headless.MarkdownError
          >;
          expect(markdownError.code).toBe("input_too_large");
          expect(markdownError.source).toBe("parse");
        };
        expectInputTooLarge(() => headless.parseMarkdown(oversized));
        expectInputTooLarge(() =>
          headless.parseMarkdownWithOptions(oversized, { gfm: true }),
        );
        expectInputTooLarge(() => headless.extractPlainText(oversized));
        expectInputTooLarge(() =>
          headless.extractPlainTextWithOptions(oversized, { gfm: true }),
        );
        expect(headless.parseMarkdown("ok")).toEqual({ type: "document" });
      },
    );

    consoleErrorSpy.mockRestore();
  });

  it("honors a custom maxInputLength lower than the hard cap", () => {
    runWithParserMock(
      () => ({
        parseWithOptions: jest.fn(() => JSON.stringify({ type: "document" })),
      }),
      (headless) => {
        expect(() =>
          headless.parseMarkdownWithOptions("123456789", {
            maxInputLength: 8,
          }),
        ).toThrow(headless.MarkdownError);
        expect(headless.parseMarkdownWithOptions("1234567", {
          maxInputLength: 8,
        })).toEqual({ type: "document" });
        expect(() =>
          headless.parseMarkdownWithOptions("éé", { maxInputLength: 3 }),
        ).toThrow(headless.MarkdownError);
        expect(headless.parseMarkdownWithOptions("éé", {
          maxInputLength: 4,
        })).toEqual({ type: "document" });
        expect(headless.parseMarkdownWithOptions("😀", {
          maxInputLength: 4,
        })).toEqual({ type: "document" });
        expect(() =>
          headless.parseMarkdownWithOptions("😀", { maxInputLength: 3 }),
        ).toThrow(headless.MarkdownError);
        expect(headless.parseMarkdownWithOptions("\ue000", {
          maxInputLength: 3,
        })).toEqual({ type: "document" });
        expect(headless.parseMarkdownWithOptions("\ud800", {
          maxInputLength: 3,
        })).toEqual({ type: "document" });
        expect(() =>
          headless.parseMarkdownWithOptions("\ud800", { maxInputLength: 2 }),
        ).toThrow(headless.MarkdownError);
        for (const value of [Number.NaN, Number.POSITIVE_INFINITY, 1.5, -1]) {
          expect(() =>
            headless.parseMarkdownWithOptions("ok", { maxInputLength: value }),
          ).toThrow(headless.MarkdownError);
        }
      },
    );
  });
});

describe("getTextContent", () => {
  it("returns content when present", () => {
    expect(getTextContent({ type: "text", content: "hello" })).toBe("hello");
  });

  it("concatenates children text recursively", () => {
    const node: MarkdownNode = {
      type: "paragraph",
      children: [
        { type: "text", content: "Hello " },
        { type: "bold", children: [{ type: "text", content: "world" }] },
      ],
    };
    expect(getTextContent(node)).toBe("Hello world");
  });

  it("returns empty string for node with no content or children", () => {
    expect(getTextContent({ type: "paragraph" })).toBe("");
  });
});

describe("getFlattenedText", () => {
  it("extracts text from a paragraph", () => {
    const node: MarkdownNode = {
      type: "paragraph",
      children: [{ type: "text", content: "Hello world" }],
    };
    expect(getFlattenedText(node)).toBe("Hello world\n\n");
  });

  it("extracts text from a heading", () => {
    const node: MarkdownNode = {
      type: "heading",
      level: 1,
      children: [{ type: "text", content: "Title" }],
    };
    expect(getFlattenedText(node)).toBe("Title\n\n");
  });

  it("handles code_block with content", () => {
    expect(getFlattenedText({ type: "code_block", content: "const x = 1;\n" })).toBe("const x = 1;\n\n");
  });

  it("handles code_block with child text fallback", () => {
    expect(
      getFlattenedText({
        type: "code_block",
        children: [{ type: "text", content: "const child = true;" }],
      }),
    ).toBe("const child = true;\n\n");
  });

  it("handles code_block without content", () => {
    expect(getFlattenedText({ type: "code_block" })).toBe("\n\n");
  });

  it("handles inline types", () => {
    expect(getFlattenedText({ type: "code_inline", content: "foo()" })).toBe("foo()");
    expect(getFlattenedText({ type: "math_inline", content: "E=mc^2" })).toBe("E=mc^2");
    expect(getFlattenedText({ type: "html_inline", content: "<br>" })).toBe("<br>");
    expect(getFlattenedText({ type: "text" })).toBe("");
  });

  it("handles break types", () => {
    expect(getFlattenedText({ type: "line_break" })).toBe("\n");
    expect(getFlattenedText({ type: "soft_break" })).toBe(" ");
    expect(getFlattenedText({ type: "horizontal_rule" })).toBe("---\n\n");
  });

  it("handles image with alt, title, or neither", () => {
    expect(getFlattenedText({ type: "image", alt: "A photo", href: "x" })).toBe("A photo");
    expect(getFlattenedText({ type: "image", title: "Title", href: "x" })).toBe("Title");
    expect(getFlattenedText({ type: "image", href: "x" })).toBe("");
  });

  it("handles table structure", () => {
    const node: MarkdownNode = {
      type: "table",
      children: [{
        type: "table_head",
        children: [{
          type: "table_row",
          children: [{ type: "table_cell", isHeader: true, children: [{ type: "text", content: "H" }] }],
        }],
      }],
    };
    const result = getFlattenedText(node);
    expect(result).toContain("H");
    expect(result).toContain("|");
  });

  it("handles document with no children", () => {
    expect(getFlattenedText({ type: "document" })).toBe("");
    expect(getFlattenedText({ type: "document", children: [] })).toBe("");
  });

  it("handles list items", () => {
    const node: MarkdownNode = {
      type: "list",
      ordered: false,
      children: [
        { type: "list_item", children: [{ type: "paragraph", children: [{ type: "text", content: "Item 1" }] }] },
      ],
    };
    expect(getFlattenedText(node)).toContain("Item 1");
  });

  it("handles blockquote", () => {
    const node: MarkdownNode = {
      type: "blockquote",
      children: [{ type: "paragraph", children: [{ type: "text", content: "Quoted" }] }],
    };
    expect(getFlattenedText(node)).toBe("Quoted\n\n");
  });

  it("handles math_block and html_block", () => {
    expect(getFlattenedText({ type: "math_block", content: "\\sum" })).toBe("\\sum\n\n");
    expect(getFlattenedText({ type: "html_block", content: "<div>hi</div>  " })).toBe("<div>hi</div>\n\n");
  });

  it("handles task_list_item", () => {
    const node: MarkdownNode = {
      type: "task_list_item",
      checked: true,
      children: [{ type: "paragraph", children: [{ type: "text", content: "Done" }] }],
    };
    expect(getFlattenedText(node)).toContain("Done");
  });
});

describe("sourceOffsets option", () => {
  beforeEach(() => jest.clearAllMocks());

  it("includes beg/end by default", () => {
    const ast = parseMarkdown("# Title");
    const heading = ast.children?.[0];
    expect(heading?.beg).toBeDefined();
    expect(heading?.end).toBeDefined();
  });

  it("forwards sourceOffsets:false to the native parser", () => {
    parseMarkdownWithOptions("# Title", { sourceOffsets: false });
    expect(mockParser.parseWithOptions).toHaveBeenCalledWith("# Title", {
      sourceOffsets: false,
    });
  });

  it("omits beg/end when sourceOffsets is false", () => {
    const ast = parseMarkdownWithOptions("# Title", { sourceOffsets: false });
    const heading = ast.children?.[0];
    expect(heading?.beg).toBeUndefined();
    expect(heading?.end).toBeUndefined();
  });

  it("keeps beg/end when sourceOffsets is omitted from options", () => {
    const ast = parseMarkdownWithOptions("# Title", { gfm: true });
    const heading = ast.children?.[0];
    expect(heading?.beg).toBeDefined();
  });
});

describe("stripSourceOffsets", () => {
  it("removes beg and end from a single node", () => {
    const result = stripSourceOffsets({ type: "text", content: "hello", beg: 0, end: 5 });
    expect(result.beg).toBeUndefined();
    expect(result.end).toBeUndefined();
    expect(result.content).toBe("hello");
  });

  it("recursively removes offsets from children", () => {
    const node: MarkdownNode = {
      type: "document",
      beg: 0,
      end: 20,
      children: [{ type: "text", content: "hi", beg: 0, end: 2 }],
    };
    const result = stripSourceOffsets(node);
    expect(result.beg).toBeUndefined();
    expect(result.children![0].beg).toBeUndefined();
  });

  it("does not add children key when original has none", () => {
    const result = stripSourceOffsets({ type: "text", content: "x" });
    expect(Object.keys(result)).not.toContain("children");
  });
});
