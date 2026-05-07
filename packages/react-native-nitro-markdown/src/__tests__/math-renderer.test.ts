import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MarkdownContext } from "../MarkdownContext";
import { MathBlock, MathInline } from "../renderers/math";
import { defaultMarkdownTheme } from "../theme";

jest.mock("ratex-react-native", () => ({ RaTeXView: "RaTeXView" }));

describe("MathBlock renderer", () => {
  it("renders block math with RaTeX inside a horizontal scroll container", () => {
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
            MarkdownContext.Provider,
            {
              value: {
                renderers: {},
                theme: defaultMarkdownTheme,
                stylingStrategy: "opinionated",
              },
            },
            createElement(MathBlock, {
              content:
                "\\frac{\\partial}{\\partial y}(x^2 + y^2) = 2y \\qquad \\text{and more}",
            }),
          ),
        );
      });

      const ratexNodes = renderer!.root.findAllByType("RaTeXView");
      expect(ratexNodes).toHaveLength(1);
      expect(ratexNodes[0].props).toEqual(
        expect.objectContaining({
          latex:
            "\\frac{\\partial}{\\partial y}(x^2 + y^2) = 2y \\qquad \\text{and more}",
          displayMode: true,
          color: defaultMarkdownTheme.colors.text,
          fontSize: defaultMarkdownTheme.fontSizes.xl,
        }),
      );

      const contentViewport = ratexNodes[0].parent?.parent;
      expect(contentViewport?.props.style).toEqual(
        expect.objectContaining({
          width: "100%",
          alignSelf: "stretch",
          maxWidth: "100%",
          overflow: "hidden",
        }),
      );
      expect(contentViewport?.props.onMoveShouldSetPanResponder).toEqual(
        expect.any(Function),
      );

      const contentTrack = ratexNodes[0].parent;
      expect(contentTrack?.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            alignSelf: "flex-start",
            alignItems: "center",
          }),
          expect.objectContaining({
            transform: [{ translateX: 0 }],
          }),
        ]),
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("renders inline and block math with RaTeX by default", () => {
    let renderer: ReactTestRenderer | undefined;
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      act(() => {
        renderer = create(
          createElement(
            MarkdownContext.Provider,
            {
              value: {
                renderers: {},
                theme: defaultMarkdownTheme,
                stylingStrategy: "opinionated",
              },
            },
            createElement(MathInline, { content: "E = mc^2" }),
            createElement(MathBlock, { content: "\\sum_{n=1}^{\\infty} n" }),
          ),
        );
      });

      const ratexNodes = renderer!.root.findAllByType("RaTeXView");
      expect(ratexNodes).toHaveLength(2);
      expect(ratexNodes[0].props).toEqual(
        expect.objectContaining({
          latex: "E = mc^2",
          displayMode: false,
          color: defaultMarkdownTheme.colors.text,
          fontSize: defaultMarkdownTheme.fontSizes.l,
        }),
      );
      expect(ratexNodes[1].props).toEqual(
        expect.objectContaining({
          latex: "\\sum_{n=1}^{\\infty} n",
          displayMode: true,
          color: defaultMarkdownTheme.colors.text,
          fontSize: defaultMarkdownTheme.fontSizes.xl,
        }),
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
