import "./setup";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { NitroModules } from "react-native-nitro-modules";
import { createMarkdownSession } from "../MarkdownSession";
import { useMarkdownSession } from "../use-markdown-stream";
import { MarkdownError, toMarkdownError } from "../errors";

describe("toMarkdownError legacy classification", () => {
  it("maps stable native messages to typed codes", () => {
    const cases: Array<[string, string]> = [
      [
        "Markdown input size 12345678 bytes exceeds the maximum of 10485760 bytes",
        "input_too_large",
      ],
      ["Buffer size limit exceeded (max 10485760 chars)", "buffer_limit"],
      ["Invalid range: from=NaN and to=0 must be finite", "invalid_range"],
      ["HybridMarkdownSession is destroyed", "destroyed"],
    ];
    for (const [message, code] of cases) {
      const error = toMarkdownError(new Error(message), "session");
      expect(error.code).toBe(code);
      expect(error.message).toBe(message);
    }
  });

  it("falls back to parse_failed for unknown native messages", () => {
    const error = toMarkdownError(new Error("unknown native failure"), "parse");
    expect(error.code).toBe("parse_failed");
    expect(error.source).toBe("parse");
  });

  it("passes through existing MarkdownErrors unchanged", () => {
    const original = new MarkdownError(
      "invalid_range",
      "session",
      "Invalid range: from=1 and to=0",
    );
    expect(toMarkdownError(original, "parse")).toBe(original);
  });
});

const createHybridObjectMock = NitroModules.createHybridObject as jest.Mock;

function SessionOwner() {
  useMarkdownSession();
  return null;
}

function TextSessionOwner({
  onSessionText,
  text,
}: {
  onSessionText: (text: string) => void;
  text: string;
}) {
  const session = useMarkdownSession(text);
  React.useEffect(() => {
    onSessionText(session.getSession().getAllText());
  }, [onSessionText, session, text]);
  return null;
}

describe("createMarkdownSession", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("creates a session without throwing", () => {
    expect(() => createMarkdownSession()).not.toThrow();
  });

  it("returns a defined object", () => {
    expect(createMarkdownSession()).toBeDefined();
  });

  it("initializes a session with text", () => {
    const session = createMarkdownSession("hello");

    expect(session.getAllText()).toBe("hello");
  });

  it("reads and writes native properties with the hybrid object as receiver", () => {
    let highlightPosition = 0;
    const nativeSession = {
      get highlightPosition() {
        if (this !== nativeSession) {
          throw new Error("NativeState receiver mismatch");
        }
        return highlightPosition;
      },
      set highlightPosition(value: number) {
        if (this !== nativeSession) {
          throw new Error("NativeState receiver mismatch");
        }
        highlightPosition = value;
      },
    };
    createHybridObjectMock.mockImplementationOnce(() => nativeSession);

    const session = createMarkdownSession();
    session.highlightPosition = 12;

    expect(session.highlightPosition).toBe(12);
  });

  it("reports clamped replace ranges for out-of-bounds inserts", () => {
    const session = createMarkdownSession();
    const listener = jest.fn();

    session.reset("hello");
    session.addListener(listener);

    expect(session.replace(10, 10, "!")).toBe(6);
    expect(session.getAllText()).toBe("hello!");
    expect(listener).toHaveBeenCalledWith(5, 6);
  });

  it("rejects invalid replace ranges", () => {
    const session = createMarkdownSession();

    session.reset("hello");

    expect(() => session.replace(Number.NaN, 0, "!")).toThrow("Invalid range");
    expect(() => session.replace(-1, 0, "!")).toThrow("Invalid range");
    expect(() => session.replace(2, 1, "!")).toThrow("Invalid range");
    expect(session.getAllText()).toBe("hello");
  });

  it("disposes hook-owned sessions on unmount without emitting clear updates", () => {
    createHybridObjectMock.mockClear();

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = TestRenderer.create(React.createElement(SessionOwner));
    });

    const session = createHybridObjectMock.mock.results[0].value;

    act(() => {
      renderer!.unmount();
    });

    expect(session.clear).not.toHaveBeenCalled();
    expect(session.dispose).toHaveBeenCalled();
  });

  it("keeps hook-owned sessions in sync with initial text changes", () => {
    const onSessionText = jest.fn();
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    act(() => {
      renderer = TestRenderer.create(
        React.createElement(TextSessionOwner, {
          onSessionText,
          text: "hello",
        }),
      );
    });

    expect(onSessionText).toHaveBeenLastCalledWith("hello");

    act(() => {
      renderer!.update(
        React.createElement(TextSessionOwner, {
          onSessionText,
          text: "updated",
        }),
      );
    });

    expect(onSessionText).toHaveBeenLastCalledWith("updated");
  });

  it("rejects session use after dispose with typed errors", () => {
    const session = createMarkdownSession();

    session.append("hello");
    session.dispose();

    const expectDestroyedCode = (fn: () => unknown) => {
      let caught: unknown;
      try {
        fn();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(MarkdownError);
      const markdownError = caught as MarkdownError;
      expect(markdownError.code).toBe("destroyed");
      expect(markdownError.source).toBe("session");
    };

    expectDestroyedCode(() => session.append("!"));
    expectDestroyedCode(() => session.clear());
    expectDestroyedCode(() => session.getAllText());
    expectDestroyedCode(() => session.getLength());
    expectDestroyedCode(() => session.getTextRange(0, 1));
    expectDestroyedCode(() => session.reset("new"));
    expectDestroyedCode(() => session.replace(0, 0, "new"));
    expectDestroyedCode(() => session.addListener(() => undefined));
  });

  it("classifies invalid ranges with the invalid_range code", () => {
    const session = createMarkdownSession();

    session.reset("hello");

    let caught: unknown;
    try {
      session.replace(Number.NaN, 0, "!");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MarkdownError);
    const markdownError = caught as MarkdownError;
    expect(markdownError.code).toBe("invalid_range");
    expect(markdownError.source).toBe("session");
  });

  it("rejects invalid ranges with a typed error before reaching the native session", () => {
    const session = createMarkdownSession();
    session.reset("hello");

    const nativeSession = createHybridObjectMock.mock.results.at(-1)!.value;
    const nativeReplace = nativeSession.replace;

    let caught: unknown;
    try {
      session.replace(2, 1, "!");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MarkdownError);
    expect((caught as MarkdownError).code).toBe("invalid_range");
    expect(nativeReplace).not.toHaveBeenCalled();
  });

  it("rejects oversized single-call writes with a typed buffer_limit error", () => {
    const session = createMarkdownSession();
    session.reset("hello");

    const nativeSession = createHybridObjectMock.mock.results.at(-1)!.value;
    const nativeAppend = nativeSession.append;

    let caught: unknown;
    try {
      session.append("x".repeat(10 * 1024 * 1024 + 1));
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MarkdownError);
    const markdownError = caught as MarkdownError;
    expect(markdownError.code).toBe("buffer_limit");
    expect(markdownError.source).toBe("session");
    expect(nativeAppend).not.toHaveBeenCalled();
  });

  it("throws typed destroyed errors after dispose without calling the native session", () => {
    const session = createMarkdownSession();
    session.reset("hello");

    const nativeSession = createHybridObjectMock.mock.results.at(-1)!.value;
    const nativeAppend = nativeSession.append;

    session.dispose();

    let caught: unknown;
    try {
      session.append("!");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(MarkdownError);
    expect((caught as MarkdownError).code).toBe("destroyed");
    expect(nativeAppend).not.toHaveBeenCalled();
  });

  it("keeps classifying native-only legacy errors by stable messages", () => {
    const session = createMarkdownSession();
    session.reset("hello");

    const nativeSession = createHybridObjectMock.mock.results.at(-1)!.value;
    nativeSession.append.mockImplementationOnce(() => {
      throw new Error("Buffer size limit exceeded (max 10485760 chars)");
    });

    // A valid call reaches the native session; cumulative overflow is only
    // knowable natively, so the stable message contract classifies it.
    let caught: unknown;
    try {
      session.append("more");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(MarkdownError);
    expect((caught as MarkdownError).code).toBe("buffer_limit");
    expect((caught as MarkdownError).source).toBe("session");
  });
});
