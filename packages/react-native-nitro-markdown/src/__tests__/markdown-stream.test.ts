import "./setup";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { MarkdownStream } from "../markdown-stream";
import type { MarkdownSession } from "../specs/MarkdownSession.nitro";

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

  beforeEach(() => {
    jest.useFakeTimers();
    markdownMock.mockClear();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
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
});
