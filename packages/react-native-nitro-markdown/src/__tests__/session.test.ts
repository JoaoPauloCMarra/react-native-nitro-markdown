import "./setup";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { NitroModules } from "react-native-nitro-modules";
import { createMarkdownSession } from "../MarkdownSession";
import { useMarkdownSession } from "../use-markdown-stream";

const createHybridObjectMock = NitroModules.createHybridObject as jest.Mock;

function SessionOwner() {
  useMarkdownSession();
  return null;
}

function TextSessionOwner({
  onSessionText,
  text,
}: {
  onSessionText: (text: string) => void;
  text: string;
}) {
  const session = useMarkdownSession(text);
  React.useEffect(() => {
    onSessionText(session.getSession().getAllText());
  }, [onSessionText, session, text]);
  return null;
}

describe("createMarkdownSession", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("creates a session without throwing", () => {
    expect(() => createMarkdownSession()).not.toThrow();
  });

  it("returns a defined object", () => {
    expect(createMarkdownSession()).toBeDefined();
  });

  it("initializes a session with text", () => {
    const session = createMarkdownSession("hello");

    expect(session.getAllText()).toBe("hello");
  });

  it("reports clamped replace ranges for out-of-bounds inserts", () => {
    const session = createMarkdownSession();
    const listener = jest.fn();

    session.reset("hello");
    session.addListener(listener);

    expect(session.replace(10, 10, "!")).toBe(6);
    expect(session.getAllText()).toBe("hello!");
    expect(listener).toHaveBeenCalledWith(5, 6);
  });

  it("rejects invalid replace ranges", () => {
    const session = createMarkdownSession();

    session.reset("hello");

    expect(() => session.replace(Number.NaN, 0, "!")).toThrow("Invalid range");
    expect(() => session.replace(-1, 0, "!")).toThrow("Invalid range");
    expect(() => session.replace(2, 1, "!")).toThrow("Invalid range");
    expect(session.getAllText()).toBe("hello");
  });

  it("disposes hook-owned sessions on unmount", () => {
    createHybridObjectMock.mockClear();

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    act(() => {
      renderer = TestRenderer.create(React.createElement(SessionOwner));
    });

    const session = createHybridObjectMock.mock.results[0].value;

    act(() => {
      renderer!.unmount();
    });

    expect(session.clear).toHaveBeenCalled();
    expect(session.dispose).toHaveBeenCalled();
  });

  it("keeps hook-owned sessions in sync with initial text changes", () => {
    const onSessionText = jest.fn();
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    act(() => {
      renderer = TestRenderer.create(
        React.createElement(TextSessionOwner, {
          onSessionText,
          text: "hello",
        }),
      );
    });

    expect(onSessionText).toHaveBeenLastCalledWith("hello");

    act(() => {
      renderer!.update(
        React.createElement(TextSessionOwner, {
          onSessionText,
          text: "updated",
        }),
      );
    });

    expect(onSessionText).toHaveBeenLastCalledWith("updated");
  });

  it("rejects session use after dispose", () => {
    const session = createMarkdownSession();

    session.append("hello");
    session.dispose();

    expect(() => session.append("!")).toThrow("destroyed");
    expect(() => session.clear()).toThrow("destroyed");
    expect(() => session.getAllText()).toThrow("destroyed");
    expect(() => session.getLength()).toThrow("destroyed");
    expect(() => session.getTextRange(0, 1)).toThrow("destroyed");
    expect(() => session.reset("new")).toThrow("destroyed");
    expect(() => session.replace(0, 0, "new")).toThrow("destroyed");
    expect(() => session.addListener(() => undefined)).toThrow("destroyed");
  });
});
