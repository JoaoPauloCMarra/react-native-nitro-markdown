import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MarkdownContext } from "../MarkdownContext";
import {
  RaTeXMathBlock as MathBlock,
  RaTeXMathInline as MathInline,
  mathRenderers,
} from "../math";
import {
  MathBlock as FallbackMathBlock,
  MathInline as FallbackMathInline,
} from "../renderers/math";
import { NodeRenderer } from "../node-renderer";
import { defaultMarkdownTheme } from "../theme";
import { hostType } from "./host-type";

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

      const ratexNodes = renderer!.root.findAllByType(hostType("RaTeXView"));
      expect(ratexNodes).toHaveLength(1);
      expect(ratexNodes[0]!.props).toEqual(
        expect.objectContaining({
          latex:
            "\\frac{\\partial}{\\partial y}(x^2 + y^2) = 2y \\qquad \\text{and more}",
          displayMode: true,
          color: defaultMarkdownTheme.colors.text,
          fontSize: defaultMarkdownTheme.fontSizes.xl,
        }),
      );

      const contentViewport = ratexNodes[0]!.parent?.parent;
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

      const contentTrack = ratexNodes[0]!.parent;
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

      const initialRaTeX = renderer!.root.findAllByType(hostType("RaTeXView"))[0]!;

      act(() => {
        renderer!.update(render("x^2 + y^2"));
      });

      const updatedRaTeX = renderer!.root.findAllByType(hostType("RaTeXView"))[0]!;
      expect(updatedRaTeX).toBe(initialRaTeX);
      expect(updatedRaTeX.props.latex).toBe("x^2 + y^2");
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("renders inline and block math with the RaTeX subpath components", () => {
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

      const ratexNodes = renderer!.root.findAllByType(hostType("RaTeXView"));
      expect(ratexNodes).toHaveLength(2);
      expect(ratexNodes[0]!.props).toEqual(
        expect.objectContaining({
          latex: "E = mc^2",
          displayMode: false,
          color: defaultMarkdownTheme.colors.text,
          fontSize: defaultMarkdownTheme.fontSizes.l,
        }),
      );
      expect(ratexNodes[1]!.props).toEqual(
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

      const initialRaTeX = renderer!.root.findAllByType(hostType("RaTeXView"))[0]!;
      const staleOnError = initialRaTeX.props.onError;
      act(() => {
        initialRaTeX.props.onError({ nativeEvent: { error: "invalid" } });
      });
      expect(renderer!.root.findAllByType(hostType("RaTeXView"))).toHaveLength(0);

      act(() => {
        renderer!.update(render("bad"));
      });
      expect(renderer!.root.findAllByType(hostType("RaTeXView"))).toHaveLength(0);

      act(() => {
        renderer!.update(render("fixed"));
      });
      expect(renderer!.root.findAllByType(hostType("RaTeXView"))).toHaveLength(1);

      act(() => {
        renderer!.update(render("bad"));
      });
      expect(renderer!.root.findAllByType(hostType("RaTeXView"))).toHaveLength(1);

      act(() => {
        staleOnError({ nativeEvent: { error: "invalid" } });
      });
      expect(renderer!.root.findAllByType(hostType("RaTeXView"))).toHaveLength(1);
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

      const initialRaTeX = renderer!.root.findAllByType(hostType("RaTeXView"))[0]!;
      const staleOnError = initialRaTeX.props.onError;
      act(() => {
        initialRaTeX.props.onError({ nativeEvent: { error: "invalid" } });
      });
      expect(renderer!.root.findAllByType(hostType("RaTeXView"))).toHaveLength(0);

      act(() => {
        renderer!.update(render("bad"));
      });
      expect(renderer!.root.findAllByType(hostType("RaTeXView"))).toHaveLength(0);

      act(() => {
        renderer!.update(render("fixed"));
      });
      expect(renderer!.root.findAllByType(hostType("RaTeXView"))).toHaveLength(1);

      act(() => {
        renderer!.update(render("bad"));
      });
      expect(renderer!.root.findAllByType(hostType("RaTeXView"))).toHaveLength(1);

      act(() => {
        staleOnError({ nativeEvent: { error: "invalid" } });
      });
      expect(renderer!.root.findAllByType(hostType("RaTeXView"))).toHaveLength(1);
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });

  it("renders math as monospace text without the RaTeX subpath", () => {
    let renderer: ReactTestRenderer | undefined;
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
          createElement(FallbackMathInline, { content: "E = mc^2" }),
          createElement(FallbackMathBlock, { content: "\\sum n" }),
        ),
      );
    });

    expect(renderer!.root.findAllByType(hostType("RaTeXView"))).toHaveLength(0);
    const texts = renderer!.root
      .findAllByType(hostType("Text"))
      .map((node) => node.props.children);
    expect(texts).toEqual(["E = mc^2", "\\sum n"]);
  });

  it("routes math nodes through mathRenderers with context styles", () => {
    let renderer: ReactTestRenderer | undefined;
    const inlineStyle = { marginHorizontal: 7 };
    act(() => {
      renderer = create(
        createElement(
          MarkdownContext.Provider,
          {
            value: {
              renderers: mathRenderers,
              theme: defaultMarkdownTheme,
              stylingStrategy: "opinionated",
              styles: { math_inline: inlineStyle },
            },
          },
          createElement(NodeRenderer, {
            node: {
              type: "paragraph",
              children: [
                { type: "math_inline", content: "$x^2$" },
              ],
            },
            depth: 0,
            inListItem: false,
          }),
          createElement(NodeRenderer, {
            node: { type: "math_block", content: "y^2" },
            depth: 0,
            inListItem: false,
          }),
        ),
      );
    });

    const ratexNodes = renderer!.root.findAllByType(hostType("RaTeXView"));
    expect(ratexNodes.map((node) => node.props.latex)).toEqual(["x^2", "y^2"]);
    expect(ratexNodes[0]!.parent?.props.style).toEqual(
      expect.arrayContaining([inlineStyle]),
    );
  });
});

describe("main entry math isolation", () => {
  it("loads the main entry without resolving ratex-react-native", () => {
    jest.isolateModules(() => {
      jest.doMock("ratex-react-native", () => {
        throw new Error("ratex-react-native must not load from the main entry");
      });
      expect(() => require("../index")).not.toThrow();
      expect(() => require("../headless")).not.toThrow();
      jest.dontMock("ratex-react-native");
    });
  });

  it("keeps ratex-react-native out of the main entry import graph", () => {
    const { readFileSync, statSync } = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const srcRoot = path.resolve(__dirname, "..");
    const seen = new Set<string>();
    const external = new Set<string>();
    const isFile = (candidate: string) =>
      statSync(candidate, { throwIfNoEntry: false })?.isFile() ?? false;
    const resolveLocal = (from: string, specifier: string): string | null => {
      const base = path.resolve(path.dirname(from), specifier);
      return (
        [
          base,
          `${base}.ts`,
          `${base}.tsx`,
          path.join(base, "index.ts"),
          path.join(base, "index.tsx"),
        ].find(isFile) ?? null
      );
    };
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      const source = readFileSync(file, "utf8");
      const specifiers = [
        ...source.matchAll(/(?:from|import|require\()\s*["']([^"']+)["']/g),
      ].map((match) => match[1]!);
      for (const specifier of specifiers) {
        if (specifier.startsWith(".")) {
          const resolved = resolveLocal(file, specifier);
          if (resolved) visit(resolved);
        } else {
          external.add(specifier);
        }
      }
    };
    visit(path.join(srcRoot, "index.ts"));

    expect(seen.size).toBeGreaterThan(10);
    expect([...external]).not.toContain("ratex-react-native");
    expect([...seen].map((file) => path.relative(srcRoot, file))).not.toContain(
      "math.tsx",
    );
  });
});
