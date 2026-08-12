import "./setup";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { Linking } from "react-native";
import { Link } from "../renderers/link";
import { MarkdownContext } from "../MarkdownContext";
import { defaultMarkdownTheme } from "../theme";

const canOpenUrlMock = Linking.canOpenURL as jest.Mock;
const openUrlMock = Linking.openURL as jest.Mock;

function renderLink(href: string, onLinkPress?: (url: string) => void) {
  const consoleErrorSpy = jest.spyOn(console, "error").mockImplementation();
  try {
    let renderer: ReturnType<typeof create> | null = null;
    act(() => {
      renderer = create(
        createElement(
          MarkdownContext.Provider,
          {
            value: {
              renderers: {},
              theme: defaultMarkdownTheme,
              stylingStrategy: "opinionated",
              ...(onLinkPress ? { onLinkPress } : {}),
            },
          },
          createElement(Link, { href }, "Example"),
        ),
      );
    });
    return renderer!.root.findByProps({ accessibilityRole: "link" });
  } finally {
    consoleErrorSpy.mockRestore();
  }
}

describe("Link renderer security policy", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    canOpenUrlMock.mockResolvedValue(true);
    openUrlMock.mockResolvedValue(undefined);
  });

  it("does not invoke onLinkPress for unsafe protocols", async () => {
    const onLinkPress = jest.fn();
    const link = renderLink("javascript:alert(1)", onLinkPress);

    await act(async () => {
      link.props.onPress();
    });

    expect(onLinkPress).not.toHaveBeenCalled();
    expect(canOpenUrlMock).not.toHaveBeenCalled();
    expect(openUrlMock).not.toHaveBeenCalled();
  });

  it("does not invoke onLinkPress for protocol-less links", async () => {
    const onLinkPress = jest.fn();
    const link = renderLink("/relative/path", onLinkPress);

    await act(async () => {
      link.props.onPress();
    });

    expect(onLinkPress).not.toHaveBeenCalled();
  });

  it("invokes onLinkPress with the validated URL for allowed links", async () => {
    const onLinkPress = jest.fn(() => true);
    const link = renderLink("https://example.com", onLinkPress);

    await act(async () => {
      link.props.onPress();
    });

    expect(onLinkPress).toHaveBeenCalledWith("https://example.com");
    expect(canOpenUrlMock).toHaveBeenCalledWith("https://example.com");
    expect(openUrlMock).toHaveBeenCalledWith("https://example.com");
  });

  it("does not open the URL when onLinkPress returns false", async () => {
    const onLinkPress = jest.fn(() => false);
    const link = renderLink("https://example.com", onLinkPress);

    await act(async () => {
      link.props.onPress();
    });

    expect(openUrlMock).not.toHaveBeenCalled();
  });

  it("does not open the URL when the system cannot open it", async () => {
    canOpenUrlMock.mockResolvedValue(false);
    const link = renderLink("mailto:test@example.com");

    await act(async () => {
      link.props.onPress();
    });

    expect(openUrlMock).not.toHaveBeenCalled();
  });
});
