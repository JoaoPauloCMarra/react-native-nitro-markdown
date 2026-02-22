import { createElement } from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { Markdown, type MarkdownProps } from "../markdown";

const TABLE_MARKDOWN = [
  "| Header 1 | Header 2 |",
  "|----------|----------|",
  "| Cell 1   | Cell 2   |",
].join("\n");

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

const renderMarkdown = (children: string): ReactTestRenderer => {
  let renderer: ReactTestRenderer | null = null;
  const markdownProps: MarkdownProps = {
    children,
    options: { gfm: true },
  };

  act(() => {
    renderer = TestRenderer.create(createElement(Markdown, markdownProps));
  });

  if (renderer === null) {
    throw new Error("Failed to render Markdown component");
  }

  return renderer;
};

describe("table renderer", () => {
  it("renders table immediately without waiting for layout measurement", () => {
    const renderer = renderMarkdown(TABLE_MARKDOWN);

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('"type":"ScrollView"');
    expect(json).toContain("Header 1");
    expect(json).toContain("Cell 1");
  });
});
