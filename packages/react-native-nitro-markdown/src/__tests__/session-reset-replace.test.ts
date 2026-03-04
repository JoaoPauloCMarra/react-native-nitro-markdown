import type { MarkdownSession } from "../specs/MarkdownSession.nitro";

// ---------------------------------------------------------------------------
// In-memory mock session (mirrors the harness in markdown-stream-delta.test.ts
// but exposes reset/replace behaviour directly without a React renderer)
// ---------------------------------------------------------------------------

type Listener = (from: number, to: number) => void;

type MockSession = {
  session: MarkdownSession;
  /** Directly read the current buffer text (bypasses getAllText mock) */
  getText: () => string;
  /** Spy on every listener notification emitted */
  notifications: Array<{ from: number; to: number }>;
};

const createMockSession = (initialText = ""): MockSession => {
  let text = initialText;
  const listeners = new Set<Listener>();
  const notifications: Array<{ from: number; to: number }> = [];

  const emitRange = (from: number, to: number): void => {
    notifications.push({ from, to });
    for (const listener of listeners) {
      listener(from, to);
    }
  };

  const session: MarkdownSession = {
    __type: "HybridObject<MarkdownSession>",
    name: "MockMarkdownSession",
    toString: () => "[HybridObject MockMarkdownSession]",
    equals: (other) => other === session,
    dispose: () => undefined,
    append: (chunk) => {
      const from = text.length;
      text += chunk;
      const to = text.length;
      emitRange(from, to);
      return to;
    },
    clear: () => {
      text = "";
      emitRange(0, 0);
    },
    getAllText: () => text,
    getLength: () => text.length,
    getTextRange: (from, to) => text.slice(from, to),
    highlightPosition: 0,
    addListener: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    reset: (newText) => {
      text = newText;
      emitRange(0, text.length);
    },
    replace: (from, to, newText) => {
      text = text.slice(0, from) + newText + text.slice(to);
      emitRange(from, from + newText.length);
      return text.length;
    },
  };

  return {
    session,
    getText: () => text,
    notifications,
  };
};

// ---------------------------------------------------------------------------
// Tests: reset
// ---------------------------------------------------------------------------

describe("MarkdownSession.reset", () => {
  it("reset('') clears the buffer", () => {
    const { session, getText } = createMockSession("initial text");
    session.reset("");
    expect(getText()).toBe("");
  });

  it("reset('') notifies listeners with (0, 0)", () => {
    const { session, notifications } = createMockSession("initial text");
    session.reset("");
    const last = notifications.at(-1);
    expect(last).toEqual({ from: 0, to: 0 });
  });

  it("reset('hello') sets the buffer to 'hello'", () => {
    const { session, getText } = createMockSession("");
    session.reset("hello");
    expect(getText()).toBe("hello");
  });

  it("reset('hello') notifies listeners with (0, 5)", () => {
    const { session, notifications } = createMockSession("");
    session.reset("hello");
    const last = notifications.at(-1);
    expect(last).toEqual({ from: 0, to: 5 });
  });

  it("after append, reset('new') replaces everything and notifies with (0, 3)", () => {
    const { session, getText, notifications } = createMockSession();
    session.append("some long existing text");
    notifications.length = 0; // clear append notifications

    session.reset("new");

    expect(getText()).toBe("new");
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toEqual({ from: 0, to: 3 });
  });

  it("multiple listeners all receive a reset notification", () => {
    const { session } = createMockSession("abc");
    const received: Array<[number, number]> = [];

    const unsub1 = session.addListener((f, t) => received.push([f, t]));
    const unsub2 = session.addListener((f, t) => received.push([f, t]));

    session.reset("xyz");

    expect(received).toHaveLength(2);
    expect(received[0]).toEqual([0, 3]);
    expect(received[1]).toEqual([0, 3]);

    unsub1();
    unsub2();
  });

  it("getAllText returns the new text after reset", () => {
    const { session } = createMockSession("old content");
    session.reset("fresh");
    expect(session.getAllText()).toBe("fresh");
  });

  it("getLength returns the length of the new text after reset", () => {
    const { session } = createMockSession("old");
    session.reset("hello world");
    expect(session.getLength()).toBe(11);
  });
});

// ---------------------------------------------------------------------------
// Tests: replace
// ---------------------------------------------------------------------------

describe("MarkdownSession.replace", () => {
  it("replaces a range and produces the expected buffer", () => {
    const { session, getText } = createMockSession("hello world");
    session.replace(0, 5, "world");
    expect(getText()).toBe("world world");
  });

  it("notifies listeners with the inserted range [from, from + newTextLength)", () => {
    const { session, notifications } = createMockSession("hello world");
    notifications.length = 0;
    session.replace(0, 5, "world");
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toEqual({ from: 0, to: 5 });
  });

  it("returns the new total buffer length", () => {
    const { session } = createMockSession("hello world");
    const newLength = session.replace(0, 5, "hi");
    // "hi world" -> length 8
    expect(newLength).toBe(8);
  });

  it("replaces text in the middle of the buffer", () => {
    const { session, getText } = createMockSession("the quick brown fox");
    session.replace(4, 9, "slow");
    expect(getText()).toBe("the slow brown fox");
  });

  it("replaces at the end of the buffer", () => {
    const { session, getText } = createMockSession("hello");
    session.replace(3, 5, "p!");
    expect(getText()).toBe("help!");
  });

  it("replace with a longer string increases buffer length", () => {
    const { session } = createMockSession("hi");
    const newLen = session.replace(0, 2, "hello world");
    expect(newLen).toBe(11);
  });

  it("replace with an empty string effectively deletes the range", () => {
    const { session, getText } = createMockSession("hello world");
    session.replace(5, 11, "");
    expect(getText()).toBe("hello");
  });

  it("multiple listeners all receive a replace notification", () => {
    const { session } = createMockSession("hello world");
    const received: Array<[number, number]> = [];

    const unsub1 = session.addListener((f, t) => received.push([f, t]));
    const unsub2 = session.addListener((f, t) => received.push([f, t]));

    session.replace(0, 5, "world");

    expect(received).toHaveLength(2);
    expect(received[0]).toEqual([0, 5]);
    expect(received[1]).toEqual([0, 5]);

    unsub1();
    unsub2();
  });

  it("getAllText returns updated text after replace", () => {
    const { session } = createMockSession("foo bar");
    session.replace(4, 7, "baz");
    expect(session.getAllText()).toBe("foo baz");
  });

  it("getTextRange reflects the new content after replace", () => {
    const { session } = createMockSession("hello world");
    session.replace(6, 11, "there");
    expect(session.getTextRange(6, 11)).toBe("there");
  });
});

// ---------------------------------------------------------------------------
// Tests: reset + replace interaction
// ---------------------------------------------------------------------------

describe("MarkdownSession reset then replace interaction", () => {
  it("replace works correctly after a reset", () => {
    const { session, getText } = createMockSession("initial");
    session.reset("hello world");
    session.replace(6, 11, "jest");
    expect(getText()).toBe("hello jest");
  });

  it("reset after replace replaces the entire resulting buffer", () => {
    const { session, getText } = createMockSession("hello world");
    session.replace(0, 5, "goodbye");
    // buffer is now "goodbye world"
    session.reset("clean slate");
    expect(getText()).toBe("clean slate");
  });
});
