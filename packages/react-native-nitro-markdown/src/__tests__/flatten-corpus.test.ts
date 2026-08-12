import "./setup";
import { parseMarkdown, getFlattenedText } from "../headless";
import { mockParser } from "./setup";

import corpus from "../__fixtures__/flatten-corpus.json";

describe("flatten differential corpus (JS getFlattenedText)", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each(corpus)("flattens $name", (entry) => {
    const ast = parseMarkdown(entry.markdown);
    expect(getFlattenedText(ast)).toBe(entry.expected);
  });

  it("shares the corpus with the native C++ flatten gate", () => {
    const names = corpus.map((entry) => entry.name);
    expect(names).toContain("empty-input");
    expect(names).toContain("multiple-blocks");
    expect(names.length).toBeGreaterThanOrEqual(10);
  });
});
