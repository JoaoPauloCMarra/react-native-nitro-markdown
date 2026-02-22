import { mockParser } from "./setup";
import { getNextStreamAst, parseMarkdownAst } from "../utils/incremental-ast";
import type { MarkdownNode } from "../headless";

const setTrailingPathEnd = (ast: MarkdownNode, end: number): MarkdownNode => {
  ast.end = end;
  const children = ast.children;
  if (children && children.length > 0) {
    const trailingChild = children[children.length - 1];
    if (trailingChild) {
      setTrailingPathEnd(trailingChild, end);
    }
  }
  return ast;
};

const percentile = (values: number[], p: number): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = p * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  const weight = rank - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

describe("stream performance budgets", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps append-only incremental updates within p95 latency budget", () => {
    let previousText = "Hello";
    let previousAst = setTrailingPathEnd(
      parseMarkdownAst(previousText),
      previousText.length,
    );

    jest.clearAllMocks();

    const timings: number[] = [];
    const iterations = 240;

    for (let i = 0; i < iterations; i++) {
      const nextText = `${previousText}a`;
      const start = performance.now();
      const nextAst = getNextStreamAst({
        previousAst,
        previousText,
        nextText,
      });
      const end = performance.now();

      timings.push(end - start);
      previousText = nextText;
      previousAst = nextAst;
    }

    const p95 = percentile(timings, 0.95);
    const p50 = percentile(timings, 0.5);

    expect(mockParser.parse).not.toHaveBeenCalled();
    expect(p50).toBeLessThanOrEqual(1.5);
    expect(p95).toBeLessThanOrEqual(4);
  });
});
