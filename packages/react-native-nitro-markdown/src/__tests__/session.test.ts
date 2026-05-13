import "./setup";
import { createMarkdownSession } from "../MarkdownSession";

describe("createMarkdownSession", () => {
  it("creates a session without throwing", () => {
    expect(() => createMarkdownSession()).not.toThrow();
  });

  it("returns a defined object", () => {
    expect(createMarkdownSession()).toBeDefined();
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
});
