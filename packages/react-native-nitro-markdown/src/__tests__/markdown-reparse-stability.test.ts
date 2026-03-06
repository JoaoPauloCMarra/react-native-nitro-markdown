import { createElement, useState, type FC } from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { mockParser } from "./setup";
import { Markdown, type MarkdownProps } from "../markdown";

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

describe("Markdown reparse stability", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does NOT reparse when parent re-renders with inline onError and plugins", () => {
    let triggerRerender: () => void = () => {};

    const Wrapper: FC = () => {
      const [counter, setCounter] = useState(0);
      triggerRerender = () => setCounter((c) => c + 1);

      return createElement(Markdown, {
        children: "Hello World",
        // Inline functions - new references on every render
        onError: (err: Error) => {
          void err;
        },
        plugins: [
          {
            name: "noop",
            beforeParse: (md: string) => md,
          },
        ],
        // Force a key dependency on counter to prove parent re-renders
        style: { opacity: counter > 0 ? 1 : 1 },
      });
    };

    let renderer: ReactTestRenderer | null = null;
    act(() => {
      renderer = TestRenderer.create(createElement(Wrapper));
    });

    const initialParseCount = mockParser.parse.mock.calls.length;

    // Trigger parent re-render (creates new onError and plugins references)
    act(() => {
      triggerRerender();
    });

    // Native parser should NOT have been called again
    expect(mockParser.parse.mock.calls.length).toBe(initialParseCount);
    expect(mockParser.parseWithOptions.mock.calls.length).toBe(0);
  });

  it("DOES reparse when children text changes", () => {
    let setText: (text: string) => void = () => {};

    const Wrapper: FC = () => {
      const [text, setTextState] = useState("Hello");
      setText = setTextState;

      return createElement(Markdown, {
        children: text,
        onError: () => {},
      });
    };

    let renderer: ReactTestRenderer | null = null;
    act(() => {
      renderer = TestRenderer.create(createElement(Wrapper));
    });

    const initialParseCount = mockParser.parse.mock.calls.length;

    act(() => {
      setText("Goodbye");
    });

    expect(mockParser.parse.mock.calls.length).toBeGreaterThan(
      initialParseCount,
    );
  });

  it("DOES reparse when parser options change", () => {
    let setMath: (val: boolean) => void = () => {};

    const Wrapper: FC = () => {
      const [math, setMathState] = useState(false);
      setMath = setMathState;

      return createElement(Markdown, {
        children: "Hello $x$",
        options: { math },
        onError: () => {},
      });
    };

    let renderer: ReactTestRenderer | null = null;
    act(() => {
      renderer = TestRenderer.create(createElement(Wrapper));
    });

    jest.clearAllMocks();

    act(() => {
      setMath(true);
    });

    const totalCalls =
      mockParser.parse.mock.calls.length +
      mockParser.parseWithOptions.mock.calls.length;
    expect(totalCalls).toBeGreaterThan(0);
  });
});
