import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MarkdownContext } from "../MarkdownContext";
import { MathBlock } from "../renderers/math";
import { defaultMarkdownTheme } from "../theme";

jest.mock(
  "react-native-mathjax-svg",
  () => ({
    __esModule: true,
    default: "MathJax",
    texToSvg: jest.fn(
      () =>
        '<svg width="900ex" height="80ex"><path fill="currentColor" /></svg>',
    ),
  }),
  { virtual: true },
);

jest.mock("react-native-svg", () => ({ SvgFromXml: "SvgFromXml" }));

describe("MathBlock renderer", () => {
  it("renders block math inside a horizontal scroll container", () => {
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

      const svgNodes = renderer!.root.findAllByType("SvgFromXml");
      expect(svgNodes).toHaveLength(1);
      expect(svgNodes[0].props.width).toBe(900);
      expect(svgNodes[0].props.height).toBe(80);
      expect(svgNodes[0].props.xml).toContain(defaultMarkdownTheme.colors.text);

      const svgFrame = svgNodes[0].parent;
      expect(svgFrame?.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ flexShrink: 0 }),
          expect.objectContaining({ width: 900, height: 80 }),
        ]),
      );

      const contentViewport = svgFrame?.parent?.parent;
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

      const contentTrack = svgFrame?.parent;
      expect(contentTrack?.props.style).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            alignSelf: "flex-start",
            alignItems: "center",
          }),
          expect.objectContaining({ width: 900 }),
          expect.objectContaining({
            transform: [{ translateX: 0 }],
          }),
        ]),
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
