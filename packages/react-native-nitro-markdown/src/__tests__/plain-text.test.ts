import { mockParser } from "./setup";
import { extractPlainText, extractPlainTextWithOptions } from "../headless";

describe("native plain text extraction", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("uses native extractPlainText when available", () => {
    const result = extractPlainText("Hello **world**");

    expect(mockParser.extractPlainText).toHaveBeenCalledWith("Hello **world**");
    expect(result).toBe("Hello **world**");
  });

  it("uses native extractPlainTextWithOptions when available", () => {
    const result = extractPlainTextWithOptions("`code`", {
      gfm: true,
      math: true,
    });

    expect(mockParser.extractPlainTextWithOptions).toHaveBeenCalledWith(
      "`code`",
      { gfm: true, math: true },
    );
    expect(result).toBe("`code`");
  });

  it("falls back to parse + flatten when native plain text methods are unavailable", () => {
    const originalExtract = mockParser.extractPlainText;
    const originalExtractWithOptions = mockParser.extractPlainTextWithOptions;

    Object.defineProperty(mockParser, "extractPlainText", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(mockParser, "extractPlainTextWithOptions", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    try {
      const plainText = extractPlainText("Hello");
      const plainTextWithOptions = extractPlainTextWithOptions("Hi", {
        gfm: true,
        math: false,
      });

      expect(mockParser.parse).toHaveBeenCalledWith("Hello");
      expect(mockParser.parseWithOptions).toHaveBeenCalledWith("Hi", {
        gfm: true,
        math: false,
      });
      expect(plainText).toContain("Hello");
      expect(plainTextWithOptions).toContain("Hi");
    } finally {
      Object.defineProperty(mockParser, "extractPlainText", {
        value: originalExtract,
        writable: true,
        configurable: true,
      });
      Object.defineProperty(mockParser, "extractPlainTextWithOptions", {
        value: originalExtractWithOptions,
        writable: true,
        configurable: true,
      });
    }
  });
});
