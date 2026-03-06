import "./setup";
import { createMarkdownSession } from "../MarkdownSession";

describe("createMarkdownSession", () => {
  it("creates a session without throwing", () => {
    expect(() => createMarkdownSession()).not.toThrow();
  });

  it("returns a defined object", () => {
    expect(createMarkdownSession()).toBeDefined();
  });
});
