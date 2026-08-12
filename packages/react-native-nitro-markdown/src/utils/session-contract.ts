import type { MarkdownSession } from "../specs/MarkdownSession.nitro";

/**
 * Shared session contract scenarios (X3 corpus).
 *
 * This module defines the cross-platform session contract as one scenario
 * list. The canonical jest gate runs it against the JavaScript session adapter
 * (`createMarkdownSession`), which wraps the native HybridObject — in this
 * gate that means the JavaScript test double, not a live native session.
 *
 * Scope limitation: the native Swift session (ios/HybridMarkdownSession.swift)
 * and Kotlin session (android/.../HybridMarkdownSession.kt) are NOT executed
 * by this gate. There is no native session test harness in this repository
 * (no XCTest target, no instrumented Kotlin tests), so the X3 native-session
 * rows remain PENDING until native runtime evidence is produced on device.
 * Until then the native implementations are mapped to these scenarios by code
 * inspection only, and this module must not be reported as cross-platform
 * executed.
 *
 * Every scenario below is written so it can run against any conforming
 * session implementation, which is the prerequisite for wiring a native
 * harness later.
 */
export type SessionScenarioName =
  | "append-extends-buffer"
  | "append-notifies-range"
  | "reset-replaces-buffer"
  | "reset-notifies-full-range"
  | "replace-inserts-in-place"
  | "replace-notifies-insert-range"
  | "replace-clamps-out-of-bounds"
  | "replace-rejects-invalid-range"
  | "getTextRange-clamps"
  | "getTextRange-rejects-invalid"
  | "clear-empties-buffer"
  | "clear-notifies-zero-range"
  | "dispose-rejects-all-operations"
  | "unsubscribe-stops-notifications"
  | "listeners-see-snapshot-ranges";

export type SessionScenario = { name: SessionScenarioName };

export const SESSION_SCENARIO_CORPUS: SessionScenario[] = [
  { name: "append-extends-buffer" },
  { name: "append-notifies-range" },
  { name: "reset-replaces-buffer" },
  { name: "reset-notifies-full-range" },
  { name: "replace-inserts-in-place" },
  { name: "replace-notifies-insert-range" },
  { name: "replace-clamps-out-of-bounds" },
  { name: "replace-rejects-invalid-range" },
  { name: "getTextRange-clamps" },
  { name: "getTextRange-rejects-invalid" },
  { name: "clear-empties-buffer" },
  { name: "clear-notifies-zero-range" },
  { name: "dispose-rejects-all-operations" },
  { name: "unsubscribe-stops-notifications" },
  { name: "listeners-see-snapshot-ranges" },
];

export type SessionScenarioResult = {
  name: SessionScenarioName;
  pass: boolean;
  detail?: string;
};

const expectRange = (
  calls: readonly (readonly [number, number])[],
  from: number,
  to: number,
): boolean => calls.some((call) => call[0] === from && call[1] === to);

const expectThrows = (fn: () => unknown): boolean => {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
};

const runScenario = (
  session: MarkdownSession,
  scenario: SessionScenario,
): SessionScenarioResult => {
  switch (scenario.name) {
    case "append-extends-buffer": {
      session.reset("hello");
      session.append(" world");
      return {
        name: scenario.name,
        pass: session.getAllText() === "hello world",
        detail: session.getAllText(),
      };
    }
    case "append-notifies-range": {
      session.reset("hello");
      const calls: [number, number][] = [];
      session.addListener((from, to) => calls.push([from, to]));
      session.append("!");
      return {
        name: scenario.name,
        pass: expectRange(calls, 5, 6),
        detail: JSON.stringify(calls),
      };
    }
    case "reset-replaces-buffer": {
      session.reset("old");
      session.reset("new content");
      return {
        name: scenario.name,
        pass: session.getAllText() === "new content",
        detail: session.getAllText(),
      };
    }
    case "reset-notifies-full-range": {
      session.reset("old");
      const calls: [number, number][] = [];
      session.addListener((from, to) => calls.push([from, to]));
      session.reset("new content");
      return {
        name: scenario.name,
        pass: expectRange(calls, 0, 11),
        detail: JSON.stringify(calls),
      };
    }
    case "replace-inserts-in-place": {
      session.reset("hello world");
      session.replace(5, 5, " brave");
      return {
        name: scenario.name,
        pass: session.getAllText() === "hello brave world",
        detail: session.getAllText(),
      };
    }
    case "replace-notifies-insert-range": {
      session.reset("hello world");
      const calls: [number, number][] = [];
      session.addListener((from, to) => calls.push([from, to]));
      session.replace(5, 5, " brave");
      return {
        name: scenario.name,
        pass: expectRange(calls, 5, 11),
        detail: JSON.stringify(calls),
      };
    }
    case "replace-clamps-out-of-bounds": {
      session.reset("hello");
      const calls: [number, number][] = [];
      session.addListener((from, to) => calls.push([from, to]));
      const newLength = session.replace(10, 10, "!");
      return {
        name: scenario.name,
        pass:
          session.getAllText() === "hello!" &&
          newLength === 6 &&
          expectRange(calls, 5, 6),
        detail: `${session.getAllText()} len=${newLength}`,
      };
    }
    case "replace-rejects-invalid-range": {
      session.reset("hello");
      const invalid =
        expectThrows(() => session.replace(Number.NaN, 0, "!")) &&
        expectThrows(() => session.replace(-1, 0, "!")) &&
        expectThrows(() => session.replace(2, 1, "!"));
      return {
        name: scenario.name,
        pass: invalid && session.getAllText() === "hello",
        detail: session.getAllText(),
      };
    }
    case "getTextRange-clamps": {
      session.reset("hello");
      return {
        name: scenario.name,
        pass:
          session.getTextRange(1, 100) === "ello" &&
          session.getTextRange(100, 200) === "",
        detail: session.getTextRange(1, 100),
      };
    }
    case "getTextRange-rejects-invalid": {
      session.reset("hello");
      return {
        name: scenario.name,
        pass: session.getTextRange(Number.NaN, 0) === "",
        detail: session.getTextRange(Number.NaN, 0),
      };
    }
    case "clear-empties-buffer": {
      session.reset("hello");
      session.clear();
      return {
        name: scenario.name,
        pass: session.getAllText() === "" && session.getLength() === 0,
        detail: session.getAllText(),
      };
    }
    case "clear-notifies-zero-range": {
      session.reset("hello");
      const calls: [number, number][] = [];
      session.addListener((from, to) => calls.push([from, to]));
      session.clear();
      return {
        name: scenario.name,
        pass: expectRange(calls, 0, 0),
        detail: JSON.stringify(calls),
      };
    }
    case "dispose-rejects-all-operations": {
      session.reset("hello");
      session.dispose();
      const allRejected =
        expectThrows(() => session.append("!")) &&
        expectThrows(() => session.clear()) &&
        expectThrows(() => session.getAllText()) &&
        expectThrows(() => session.getLength()) &&
        expectThrows(() => session.getTextRange(0, 1)) &&
        expectThrows(() => session.reset("new")) &&
        expectThrows(() => session.replace(0, 0, "new")) &&
        expectThrows(() => session.addListener(() => undefined));
      return {
        name: scenario.name,
        pass: allRejected,
      };
    }
    case "unsubscribe-stops-notifications": {
      session.reset("hello");
      const calls: [number, number][] = [];
      const unsubscribe = session.addListener((from, to) =>
        calls.push([from, to]),
      );
      unsubscribe();
      session.append("!");
      return {
        name: scenario.name,
        pass: calls.length === 0,
        detail: JSON.stringify(calls),
      };
    }
    case "listeners-see-snapshot-ranges": {
      session.reset("");
      const calls: [number, number][] = [];
      const unsubscribe = session.addListener((from, to) =>
        calls.push([from, to]),
      );
      session.append("one ");
      session.append("two");
      unsubscribe();
      const expected = JSON.stringify([
        [0, 4],
        [4, 7],
      ]);
      return {
        name: scenario.name,
        pass: JSON.stringify(calls) === expected,
        detail: JSON.stringify(calls),
      };
    }
    default:
      return {
        name: scenario.name,
        pass: false,
        detail: "unknown scenario",
      };
  }
};

/**
 * Runs the shared session scenario corpus against a fresh session per
 * scenario (the dispose scenario destroys its session, so scenarios cannot
 * share one instance). Returns per-scenario results.
 */
export const runSessionScenarioCorpus = (
  createSession: () => MarkdownSession,
): SessionScenarioResult[] =>
  SESSION_SCENARIO_CORPUS.map((scenario) =>
    runScenario(createSession(), scenario),
  );
