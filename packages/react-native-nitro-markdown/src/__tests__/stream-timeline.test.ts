import {
  createTimestampTimeline,
  resolveHighlightPosition,
  type TimestampTimeline,
} from "../utils/stream-timeline";

describe("createTimestampTimeline", () => {
  it("creates a sorted monotonic timeline", () => {
    const result = createTimestampTimeline({ 2: 240, 0: 100, 1: 180 });
    expect(result.monotonic).toBe(true);
    expect(result.entries).toEqual([
      { index: 0, time: 100 },
      { index: 1, time: 180 },
      { index: 2, time: 240 },
    ]);
  });

  it("marks timeline as non-monotonic when times decrease", () => {
    const result = createTimestampTimeline({ 0: 300, 1: 200, 2: 400 });
    expect(result.monotonic).toBe(false);
  });

  it("filters invalid keys and times", () => {
    const result = createTimestampTimeline({ 0: 100, 1: NaN, 2: Infinity });
    expect(result.entries).toEqual([{ index: 0, time: 100 }]);
  });

  it("returns empty timeline for undefined input", () => {
    const result = createTimestampTimeline();
    expect(result.entries).toHaveLength(0);
    expect(result.monotonic).toBe(true);
  });
});

describe("resolveHighlightPosition", () => {
  it("returns 0 for empty timelines", () => {
    expect(resolveHighlightPosition({ entries: [], monotonic: true }, 500)).toBe(0);
  });

  it("uses binary search for monotonic timelines", () => {
    const timeline: TimestampTimeline = {
      monotonic: true,
      entries: [
        { index: 0, time: 100 },
        { index: 1, time: 220 },
        { index: 2, time: 420 },
      ],
    };

    expect(resolveHighlightPosition(timeline, 50)).toBe(0);
    expect(resolveHighlightPosition(timeline, 100)).toBe(1);
    expect(resolveHighlightPosition(timeline, 419)).toBe(2);
    expect(resolveHighlightPosition(timeline, 999)).toBe(3);
  });

  it("uses linear scan for non-monotonic timelines", () => {
    const timeline: TimestampTimeline = {
      monotonic: false,
      entries: [
        { index: 0, time: 300 },
        { index: 1, time: 100 },
        { index: 2, time: 500 },
      ],
    };

    expect(resolveHighlightPosition(timeline, 150)).toBe(2);
    expect(resolveHighlightPosition(timeline, 350)).toBe(2);
    expect(resolveHighlightPosition(timeline, 700)).toBe(3);
  });
});
