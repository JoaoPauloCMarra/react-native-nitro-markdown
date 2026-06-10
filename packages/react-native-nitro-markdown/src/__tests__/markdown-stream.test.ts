import "./setup";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { MarkdownStream } from "../markdown-stream";
import type { MarkdownSession } from "../specs/MarkdownSession.nitro";
import type { MarkdownSessionController } from "../use-markdown-stream";

const markdownMock = jest.fn(() => null);

jest.mock("../markdown", () => ({
  Markdown: (props: { children?: string }) => markdownMock(props),
}));

type SessionListener = (from: number, to: number) => void;

function createSession({
  allText,
  rangeText,
  throwOnRange = false,
}: {
  allText: string;
  rangeText: string;
  throwOnRange?: boolean;
}): MarkdownSession & { emit: SessionListener; setAllText: (text: string) => void } {
  let listener: SessionListener | null = null;
  let currentAllText = allText;

  return {
    append: jest.fn(),
    clear: jest.fn(),
    dispose: jest.fn(),
    emit: (from: number, to: number) => listener?.(from, to),
    setAllText: (text: string) => {
      currentAllText = text;
    },
    getAllText: jest.fn(() => currentAllText),
    getLength: jest.fn(() => currentAllText.length),
    getTextRange: jest.fn(() => {
      if (throwOnRange) throw new Error("range unavailable");
      return rangeText;
    }),
    highlightPosition: 0,
    replace: jest.fn(),
    reset: jest.fn(),
    addListener: jest.fn((nextListener: SessionListener) => {
      listener = nextListener;
      return () => {
        listener = null;
      };
    }),
  } as MarkdownSession & { emit: SessionListener; setAllText: (text: string) => void };
}

describe("MarkdownStream", () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    markdownMock.mockClear();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    jest.useRealTimers();
  });

  it("falls back to full session text when append range reads fail", () => {
    const session = createSession({
      allText: "hello",
      rangeText: " world",
      throwOnRange: true,
    });

    act(() => {
      TestRenderer.create(
        React.createElement(MarkdownStream, {
          session,
          updateIntervalMs: 1,
        }),
      );
    });

    act(() => {
      session.setAllText("hello world");
      session.emit(5, 11);
      jest.runOnlyPendingTimers();
    });

    expect(session.getTextRange).toHaveBeenCalledWith(5, 11);
    expect(session.getAllText).toHaveBeenCalled();
    expect(markdownMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ children: "hello world" }),
    );
  });

  it("accepts the controller returned by useMarkdownSession", () => {
    const session = createSession({
      allText: "hello",
      rangeText: " world",
    });
    const controller = {
      getSession: () => session,
    } as unknown as MarkdownSessionController;

    act(() => {
      TestRenderer.create(
        React.createElement(MarkdownStream, {
          session: controller,
          updateIntervalMs: 1,
        }),
      );
    });

    act(() => {
      session.setAllText("hello world");
      session.emit(5, 11);
      jest.runOnlyPendingTimers();
    });

    expect(markdownMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ children: "hello world" }),
    );
  });

  it("keeps the stream subscription stable when parser option values do not change", () => {
    const session = createSession({
      allText: "hello",
      rangeText: " world",
    });

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = TestRenderer.create(
        React.createElement(MarkdownStream, {
          session,
          options: { gfm: true, math: true },
          updateIntervalMs: 1,
        }),
      );
    });

    expect(session.addListener).toHaveBeenCalledTimes(1);

    act(() => {
      renderer!.update(
        React.createElement(MarkdownStream, {
          session,
          options: { gfm: true, math: true },
          updateIntervalMs: 1,
        }),
      );
    });

    expect(session.addListener).toHaveBeenCalledTimes(1);
  });

  it("falls back to full session text when reset-like range reads fail", () => {
    const session = createSession({
      allText: "old",
      rangeText: "replacement",
      throwOnRange: true,
    });

    act(() => {
      TestRenderer.create(
        React.createElement(MarkdownStream, {
          session,
          updateIntervalMs: 1,
        }),
      );
    });

    act(() => {
      session.setAllText("replacement");
      session.emit(0, 11);
      jest.runOnlyPendingTimers();
    });

    expect(session.getTextRange).toHaveBeenCalledWith(0, 11);
    expect(session.getAllText).toHaveBeenCalled();
    expect(markdownMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ children: "replacement" }),
    );
  });

  it("falls back to full session text for replace ranges inside existing text", () => {
    const session = createSession({
      allText: "hello world",
      rangeText: "x",
    });

    act(() => {
      TestRenderer.create(
        React.createElement(MarkdownStream, {
          session,
          updateIntervalMs: 1,
        }),
      );
    });

    act(() => {
      session.setAllText("hello brave world");
      session.emit(6, 11);
      jest.runOnlyPendingTimers();
    });

    expect(session.getTextRange).not.toHaveBeenCalled();
    expect(session.getAllText).toHaveBeenCalled();
    expect(markdownMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ children: "hello brave world" }),
    );
  });

  it("does not throw when a destroyed session rejects subscription", () => {
    const session = createSession({
      allText: "hello",
      rangeText: "",
    });
    session.addListener = jest.fn(() => {
      throw new Error("destroyed");
    });

    expect(() => {
      act(() => {
        TestRenderer.create(React.createElement(MarkdownStream, { session }));
      });
    }).not.toThrow();
  });

  it("does not throw when native unsubscription fails during cleanup", () => {
    const session = createSession({
      allText: "hello",
      rangeText: "",
    });
    const unsubscribe = jest.fn(() => {
      throw new Error("unsubscribe failed");
    });
    session.addListener = jest.fn(() => unsubscribe);

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = TestRenderer.create(React.createElement(MarkdownStream, { session }));
    });

    expect(() => {
      act(() => {
        renderer!.unmount();
      });
    }).not.toThrow();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it("does not throw when a pending flush reads a disposed session", () => {
    const session = createSession({
      allText: "hello",
      rangeText: " world",
    });

    act(() => {
      TestRenderer.create(
        React.createElement(MarkdownStream, {
          session,
          updateIntervalMs: 1,
        }),
      );
    });

    act(() => {
      session.setAllText("hello world");
      session.emit(5, 11);
      session.getTextRange = jest.fn(() => {
        throw new Error("NativeState is null");
      });
      session.getAllText = jest.fn(() => {
        throw new Error("NativeState is null");
      });

      expect(() => {
        jest.runOnlyPendingTimers();
      }).not.toThrow();
    });

    expect(markdownMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ children: "hello" }),
    );
  });
});
