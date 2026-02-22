import { createElement } from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { MarkdownStream } from "../markdown-stream";
import type { MarkdownSession } from "../specs/MarkdownSession.nitro";

type Listener = (from: number, to: number) => void;

type SessionHarness = {
  session: MarkdownSession;
  emitRange: (from: number, to: number) => void;
  getAllTextMock: jest.Mock<string, []>;
  getTextRangeMock: jest.Mock<string, [number, number]>;
};

const createSessionHarness = (initialText = ""): SessionHarness => {
  let text = initialText;
  const listeners = new Set<Listener>();
  const getAllTextMock = jest.fn(() => text);
  const getTextRangeMock = jest.fn((from: number, to: number) =>
    text.slice(from, to),
  );

  const emitRange = (from: number, to: number) => {
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
    getAllText: getAllTextMock,
    getLength: () => text.length,
    getTextRange: getTextRangeMock,
    highlightPosition: 0,
    addListener: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return {
    session,
    emitRange,
    getAllTextMock,
    getTextRangeMock,
  };
};

const runtimeConsole = globalThis.console;
const originalConsoleError = runtimeConsole.error.bind(runtimeConsole);

beforeAll(() => {
  jest
    .spyOn(runtimeConsole, "error")
    .mockImplementation((message, ...optionalParams) => {
      if (
        typeof message === "string" &&
        message.includes("react-test-renderer is deprecated")
      ) {
        return;
      }

      originalConsoleError(message, ...optionalParams);
    });
});

afterAll(() => {
  jest.restoreAllMocks();
});

describe("MarkdownStream delta updates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
  });

  const renderStream = (session: MarkdownSession): ReactTestRenderer => {
    let renderer: ReactTestRenderer | null = null;

    act(() => {
      renderer = TestRenderer.create(
        createElement(MarkdownStream, {
          session,
          updateStrategy: "interval",
          updateIntervalMs: 1,
        }),
      );
    });

    if (!renderer) {
      throw new Error("Failed to render MarkdownStream");
    }

    return renderer;
  };

  it("uses getTextRange for contiguous append updates", () => {
    const { session, getAllTextMock, getTextRangeMock } =
      createSessionHarness();
    const renderer = renderStream(session);
    const initialGetAllTextCalls = getAllTextMock.mock.calls.length;

    act(() => {
      session.append("Hello");
      session.append(" ");
      session.append("world");
      jest.advanceTimersByTime(5);
    });

    expect(getTextRangeMock).toHaveBeenCalledTimes(1);
    expect(getTextRangeMock).toHaveBeenCalledWith(0, 11);
    expect(
      getAllTextMock.mock.calls.length - initialGetAllTextCalls,
    ).toBeLessThanOrEqual(1);
    act(() => {
      renderer.unmount();
    });
  });

  it("falls back to getAllText when range is not contiguous", () => {
    const { session, emitRange, getAllTextMock } =
      createSessionHarness("Hello");
    const renderer = renderStream(session);
    const initialGetAllTextCalls = getAllTextMock.mock.calls.length;

    act(() => {
      emitRange(2, 4);
      jest.advanceTimersByTime(5);
    });

    expect(getAllTextMock.mock.calls.length).toBeGreaterThan(
      initialGetAllTextCalls,
    );
    act(() => {
      renderer.unmount();
    });
  });
});
