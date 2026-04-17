import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { Markdown, type MarkdownPlugin } from "../markdown";

jest.mock("../renderers/math", () => ({
  MathInline: "MathInline",
  MathBlock: "MathBlock",
}));

describe("Markdown plugin pipeline", () => {
  it("re-runs the parse pipeline when plugins change", () => {
    const firstPlugins: MarkdownPlugin[] = [
      { name: "first", beforeParse: () => "first" },
    ];
    const secondPlugins: MarkdownPlugin[] = [
      { name: "second", beforeParse: () => "second" },
    ];
    const onParseComplete = jest.fn();
    let renderer: ReactTestRenderer | undefined;
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation((message?: unknown, ...args: unknown[]) => {
        if (
          typeof message === "string" &&
          message.includes("react-test-renderer is deprecated")
        ) {
          return;
        }
        process.stderr.write(
          [message, ...args].map((arg) => String(arg)).join(" ") + "\n",
        );
      });

    try {
      act(() => {
        renderer = create(
          createElement(
            Markdown,
            { plugins: firstPlugins, onParseComplete },
            "same input",
          ),
        );
      });

      expect(onParseComplete).toHaveBeenLastCalledWith(
        expect.objectContaining({ text: "first\n\n" }),
      );

      act(() => {
        renderer!.update(
          createElement(
            Markdown,
            { plugins: secondPlugins, onParseComplete },
            "same input",
          ),
        );
      });

      expect(onParseComplete).toHaveBeenLastCalledWith(
        expect.objectContaining({ text: "second\n\n" }),
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
