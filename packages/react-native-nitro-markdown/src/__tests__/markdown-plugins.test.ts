import { createElement } from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { mockParser } from "./setup";
import { parseMarkdown, type MarkdownNode } from "../headless";
import { Markdown, type AstTransform, type MarkdownProps } from "../markdown";

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

const replaceWink = (replacement: string): AstTransform => {
  const transformNode = (node: MarkdownNode): MarkdownNode => {
    const children = node.children?.map(transformNode);

    if (node.type === "text") {
      return {
        ...node,
        content: (node.content ?? "").replace(/:wink:/g, replacement),
        children,
      };
    }

    return {
      ...node,
      children,
    };
  };

  return (ast) => transformNode(ast);
};

describe("Markdown plugins", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("applies beforeParse plugins before native parsing", () => {
    const beforeParse = jest.fn((markdown: string) =>
      markdown.replace(/:rocket:/g, "**rocket**"),
    );

    const renderer = renderMarkdown({
      children: "Launch :rocket:",
      plugins: [{ name: "rocket", beforeParse }],
    });

    expect(beforeParse).toHaveBeenCalled();
    expect(JSON.stringify(renderer.toJSON())).toContain("rocket");
  });

  it("runs plugin afterParse before astTransform", () => {
    const onParseComplete = jest.fn<
      void,
      [{ raw: string; ast: MarkdownNode; text: string }]
    >();

    const renderer = renderMarkdown({
      children: "Hi :wink:",
      plugins: [{ name: "wink", afterParse: replaceWink("😉") }],
      astTransform: replaceWink("😎"),
      onParseComplete,
    });

    const completion = onParseComplete.mock.calls.at(-1)?.[0];
    expect(completion?.text).toContain("😉");
    expect(completion?.text).not.toContain(":wink:");
    expect(JSON.stringify(renderer.toJSON())).toContain("😉");
  });

  it("skips native parse when sourceAst is provided", () => {
    const sourceAst = parseMarkdown("From source AST");
    jest.clearAllMocks();

    const renderer = renderMarkdown({
      children: "ignored",
      sourceAst,
    });

    expect(mockParser.parse).not.toHaveBeenCalled();
    expect(mockParser.parseWithOptions).not.toHaveBeenCalled();
    expect(JSON.stringify(renderer.toJSON())).toContain("From source AST");
  });
});
