import { createElement } from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { Markdown, type MarkdownProps } from "../markdown";

const MULTI_BLOCK_MARKDOWN = [
  "# Title",
  "",
  "First paragraph",
  "",
  "Second paragraph",
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

describe("Markdown virtualization", () => {
  it("renders non-virtualized tree by default", () => {
    const renderer = renderMarkdown({
      children: MULTI_BLOCK_MARKDOWN,
      options: { gfm: true },
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain('"type":"FlatList"');
  });

  it("renders top-level blocks with FlatList when virtualization is enabled", () => {
    const renderer = renderMarkdown({
      children: MULTI_BLOCK_MARKDOWN,
      options: { gfm: true },
      virtualize: true,
      virtualizationMinBlocks: 1,
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('"type":"FlatList"');
  });

  it("supports virtualize auto mode for large block sets", () => {
    const renderer = renderMarkdown({
      children: MULTI_BLOCK_MARKDOWN,
      options: { gfm: true },
      virtualize: "auto",
      virtualizationMinBlocks: 1,
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('"type":"FlatList"');
  });
});
