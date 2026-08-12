import "./setup";
import { parseMarkdownWithOptions, stripSourceOffsets } from "../headless";
import type { ParserOptions } from "../Markdown.nitro";

import corpus from "../__fixtures__/conformance-corpus.json";

// The jest parser mock reproduces the native AST for a subset of the shared
// conformance corpus. The full corpus runs against the real md4c-based parser
// in the C++ gate (`bun run test:cpp`), which is the canonical conformance run.
const MOCK_SUPPORTED = new Set([
  "heading-1",
  "heading-6",
  "blockquote",
  "horizontal-rule",
  "unicode",
  "html-disabled-default",
]);

const supportedEntries = corpus.filter((entry) =>
  MOCK_SUPPORTED.has(entry.name),
);

describe("conformance corpus (JS wrapper path)", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(supportedEntries)("parses $name to the expected AST", (entry) => {
    const options = entry.options as ParserOptions | undefined;
    const ast = options
      ? parseMarkdownWithOptions(entry.markdown, options)
      : parseMarkdownWithOptions(entry.markdown, {});
    expect(stripSourceOffsets(ast)).toEqual(entry.expected);
  });

  it("runs the full corpus in the native C++ gate", () => {
    expect(corpus.length).toBeGreaterThanOrEqual(30);
    expect(
      corpus.some((entry) => entry.name === "table"),
    ).toBe(true);
  });
});
