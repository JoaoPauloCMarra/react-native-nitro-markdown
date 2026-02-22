import { createElement } from "react";
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

const renderMarkdown = (props: MarkdownProps): ReactTestRenderer => {
  let renderer: ReactTestRenderer | null = null;

  act(() => {
    renderer = TestRenderer.create(createElement(Markdown, props));
  });

  if (renderer === null) {
    throw new Error("Failed to render Markdown component");
  }

  return renderer;
};

describe("Markdown parse cache behavior", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reuses parse cache for repeated small markdown inputs", () => {
    const content = `small-cache-key::${"a".repeat(256)}`;

    renderMarkdown({ children: content });
    expect(mockParser.parse).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();

    renderMarkdown({ children: content });
    expect(mockParser.parse).not.toHaveBeenCalled();
  });

  it("bypasses parse cache for repeated very large markdown inputs", () => {
    const content = `large-cache-key::${"a".repeat(30_000)}`;

    renderMarkdown({ children: content });
    expect(mockParser.parse).toHaveBeenCalledTimes(1);

    jest.clearAllMocks();

    renderMarkdown({ children: content });
    expect(mockParser.parse).toHaveBeenCalledTimes(1);
  });
});
