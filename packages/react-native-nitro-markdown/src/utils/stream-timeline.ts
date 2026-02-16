export type TimestampEntry = {
  index: number;
  time: number;
};

export type TimestampTimeline = {
  entries: TimestampEntry[];
  monotonic: boolean;
};

export const createTimestampTimeline = (
  timestamps?: Record<number, number>,
): TimestampTimeline => {
  if (!timestamps) {
    return { entries: [], monotonic: true };
  }

  const entries = Object.keys(timestamps)
    .map(Number)
    .filter((index) => Number.isFinite(index))
    .sort((a, b) => a - b)
    .map((index) => ({
      index,
      time: timestamps[index],
    }))
    .filter((entry) => Number.isFinite(entry.time));

  let monotonic = true;
  for (let i = 1; i < entries.length; i += 1) {
    if (entries[i].time < entries[i - 1].time) {
      monotonic = false;
      break;
    }
  }

  return { entries, monotonic };
};

export const resolveHighlightPosition = (
  timeline: TimestampTimeline,
  currentTimeMs: number,
): number => {
  const { entries, monotonic } = timeline;
  if (entries.length === 0) return 0;

  if (!monotonic) {
    let wordIndex = 0;
    for (const entry of entries) {
      if (currentTimeMs >= entry.time) {
        wordIndex = entry.index + 1;
      }
    }
    return wordIndex;
  }

  let left = 0;
  let right = entries.length - 1;
  let resolvedIndex = -1;

  while (left <= right) {
    const mid = (left + right) >> 1;
    if (entries[mid].time <= currentTimeMs) {
      resolvedIndex = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  if (resolvedIndex === -1) return 0;
  return entries[resolvedIndex].index + 1;
};
