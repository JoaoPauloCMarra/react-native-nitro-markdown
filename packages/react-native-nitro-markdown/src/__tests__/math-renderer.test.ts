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

      const mathContainer = contentViewport?.parent?.parent;
      expect(mathContainer?.props.accessible).toBe(true);
      expect(mathContainer?.props.accessibilityLabel).toBe(
        "\\frac{\\partial}{\\partial y}(x^2 + y^2) = 2y \\qquad \\text{and more}",
      );
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("preserves the RaTeX instance while streamed content changes", () => {
    let renderer: ReactTestRenderer | undefined;
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const render = (content: string) =>
      createElement(
        MarkdownContext.Provider,
        {
          value: {
            renderers: {},
            theme: defaultMarkdownTheme,
            stylingStrategy: "opinionated",
          },
        },
        createElement(MathBlock, { content }),
      );

    try {
      act(() => {
        renderer = create(render("x^2"));
      });

      const initialRaTeX = renderer!.root.findAllByType("RaTeXView")[0];

      act(() => {
        renderer!.update(render("x^2 + y^2"));
      });

      const updatedRaTeX = renderer!.root.findAllByType("RaTeXView")[0];
      expect(updatedRaTeX).toBe(initialRaTeX);
      expect(updatedRaTeX.props.latex).toBe("x^2 + y^2");
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

  it("keeps failed inline math on fallback until content changes", () => {
    let renderer: ReactTestRenderer | undefined;
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const render = (content: string) =>
      createElement(
        MarkdownContext.Provider,
        {
          value: {
            renderers: {},
            theme: defaultMarkdownTheme,
            stylingStrategy: "opinionated",
          },
        },
        createElement(MathInline, { content }),
      );

    try {
      act(() => {
        renderer = create(render("bad"));
      });

      const initialRaTeX = renderer!.root.findAllByType("RaTeXView")[0];
      const staleOnError = initialRaTeX.props.onError;
      act(() => {
        initialRaTeX.props.onError({ nativeEvent: { error: "invalid" } });
      });
      expect(renderer!.root.findAllByType("RaTeXView")).toHaveLength(0);

      act(() => {
        renderer!.update(render("bad"));
      });
      expect(renderer!.root.findAllByType("RaTeXView")).toHaveLength(0);

      act(() => {
        renderer!.update(render("fixed"));
      });
      expect(renderer!.root.findAllByType("RaTeXView")).toHaveLength(1);

      act(() => {
        renderer!.update(render("bad"));
      });
      expect(renderer!.root.findAllByType("RaTeXView")).toHaveLength(1);

      act(() => {
        staleOnError({ nativeEvent: { error: "invalid" } });
      });
      expect(renderer!.root.findAllByType("RaTeXView")).toHaveLength(1);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("keeps failed block math on fallback until content changes", () => {
    let renderer: ReactTestRenderer | undefined;
    const consoleErrorSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const render = (content: string) =>
      createElement(
        MarkdownContext.Provider,
        {
          value: {
            renderers: {},
            theme: defaultMarkdownTheme,
            stylingStrategy: "opinionated",
          },
        },
        createElement(MathBlock, { content }),
      );

    try {
      act(() => {
        renderer = create(render("bad"));
      });

      const initialRaTeX = renderer!.root.findAllByType("RaTeXView")[0];
      const staleOnError = initialRaTeX.props.onError;
      act(() => {
        initialRaTeX.props.onError({ nativeEvent: { error: "invalid" } });
      });
      expect(renderer!.root.findAllByType("RaTeXView")).toHaveLength(0);

      act(() => {
        renderer!.update(render("bad"));
      });
      expect(renderer!.root.findAllByType("RaTeXView")).toHaveLength(0);

      act(() => {
        renderer!.update(render("fixed"));
      });
      expect(renderer!.root.findAllByType("RaTeXView")).toHaveLength(1);

      act(() => {
        renderer!.update(render("bad"));
      });
      expect(renderer!.root.findAllByType("RaTeXView")).toHaveLength(1);

      act(() => {
        staleOnError({ nativeEvent: { error: "invalid" } });
      });
      expect(renderer!.root.findAllByType("RaTeXView")).toHaveLength(1);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});
