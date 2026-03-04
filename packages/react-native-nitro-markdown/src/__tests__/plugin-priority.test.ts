import { createElement } from "react";
import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";
import { mockParser } from "./setup";
import { Markdown, type MarkdownPlugin, type MarkdownProps } from "../markdown";

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

describe("MarkdownPlugin priority ordering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("runs plugins in array order when no priority is set", () => {
    const callOrder: string[] = [];

    const pluginA: MarkdownPlugin = {
      name: "A",
      beforeParse: (md) => {
        callOrder.push("A");
        return md;
      },
    };

    const pluginB: MarkdownPlugin = {
      name: "B",
      beforeParse: (md) => {
        callOrder.push("B");
        return md;
      },
    };

    renderMarkdown({
      children: "hello",
      plugins: [pluginA, pluginB],
    });

    // Both have default priority 0, so stable sort preserves insertion order
    expect(callOrder).toEqual(["A", "B"]);
  });

  it("runs higher-priority plugin before lower-priority plugin in beforeParse", () => {
    const callOrder: string[] = [];

    const lowPriority: MarkdownPlugin = {
      name: "low",
      priority: 5,
      beforeParse: (md) => {
        callOrder.push("low");
        return md;
      },
    };

    const highPriority: MarkdownPlugin = {
      name: "high",
      priority: 10,
      beforeParse: (md) => {
        callOrder.push("high");
        return md;
      },
    };

    renderMarkdown({
      children: "hello",
      // low is listed first in the array but has lower priority
      plugins: [lowPriority, highPriority],
    });

    expect(callOrder[0]).toBe("high");
    expect(callOrder[1]).toBe("low");
  });

  it("runs priority-100 plugin before priority-0 plugin", () => {
    const callOrder: string[] = [];

    const zeroPriority: MarkdownPlugin = {
      name: "zero",
      priority: 0,
      beforeParse: (md) => {
        callOrder.push("zero");
        return md;
      },
    };

    const hundredPriority: MarkdownPlugin = {
      name: "hundred",
      priority: 100,
      beforeParse: (md) => {
        callOrder.push("hundred");
        return md;
      },
    };

    renderMarkdown({
      children: "world",
      // zero listed first but should run second
      plugins: [zeroPriority, hundredPriority],
    });

    expect(callOrder[0]).toBe("hundred");
    expect(callOrder[1]).toBe("zero");
  });

  it("treats a plugin with no priority field as having priority 0", () => {
    const callOrder: string[] = [];

    const noPriority: MarkdownPlugin = {
      name: "noPriority",
      beforeParse: (md) => {
        callOrder.push("noPriority");
        return md;
      },
    };

    const explicitZero: MarkdownPlugin = {
      name: "explicitZero",
      priority: 0,
      beforeParse: (md) => {
        callOrder.push("explicitZero");
        return md;
      },
    };

    renderMarkdown({
      children: "test",
      plugins: [noPriority, explicitZero],
    });

    // Both have effective priority 0; both should have run
    expect(callOrder).toContain("noPriority");
    expect(callOrder).toContain("explicitZero");
  });

  it("priority ordering applies to afterParse plugins as well", () => {
    const callOrder: string[] = [];

    const lowAfter: MarkdownPlugin = {
      name: "lowAfter",
      priority: 1,
      afterParse: (ast) => {
        callOrder.push("lowAfter");
        return ast;
      },
    };

    const highAfter: MarkdownPlugin = {
      name: "highAfter",
      priority: 50,
      afterParse: (ast) => {
        callOrder.push("highAfter");
        return ast;
      },
    };

    renderMarkdown({
      children: "test",
      plugins: [lowAfter, highAfter],
    });

    expect(callOrder[0]).toBe("highAfter");
    expect(callOrder[1]).toBe("lowAfter");
  });

  it("higher-priority beforeParse transformation takes effect first and can be seen by lower-priority plugin", () => {
    // plugin with priority 10 replaces "foo" with "bar"
    // plugin with priority 5 replaces "bar" with "baz"
    // end result should be "baz" if ordering is correct (10 then 5)
    const highTransform: MarkdownPlugin = {
      name: "highTransform",
      priority: 10,
      beforeParse: (md) => md.replace("foo", "bar"),
    };

    const lowTransform: MarkdownPlugin = {
      name: "lowTransform",
      priority: 5,
      beforeParse: (md) => md.replace("bar", "baz"),
    };

    // We capture the text that eventually reaches the mock parser
    let capturedInput: string | undefined;
    mockParser.parse.mockImplementationOnce((text: string) => {
      capturedInput = text;
      return JSON.stringify({ type: "document", children: [] });
    });

    renderMarkdown({
      children: "foo",
      plugins: [lowTransform, highTransform],
    });

    expect(capturedInput).toBe("baz");
  });
});
