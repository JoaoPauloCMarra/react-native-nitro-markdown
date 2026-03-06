import { normalizeLinkHref, getAllowedExternalHref } from "../utils/link-security";

describe("normalizeLinkHref", () => {
  it("returns null for empty string", () => {
    expect(normalizeLinkHref("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(normalizeLinkHref("   ")).toBeNull();
  });

  it("trims whitespace", () => {
    expect(normalizeLinkHref("  https://example.com  ")).toBe("https://example.com");
  });

  it("returns non-empty href as-is", () => {
    expect(normalizeLinkHref("https://example.com")).toBe("https://example.com");
  });
});

describe("getAllowedExternalHref", () => {
  it.each(["https://example.com", "http://example.com", "mailto:a@b.com", "tel:+123", "sms:+123"])(
    "allows %s",
    (href) => {
      expect(getAllowedExternalHref(href)).toBe(href);
    },
  );

  it.each(["javascript:alert(1)", "data:text/html,<h1>hi</h1>", "ftp://example.com"])(
    "rejects %s",
    (href) => {
      expect(getAllowedExternalHref(href)).toBeNull();
    },
  );

  it("rejects links without explicit protocol", () => {
    expect(getAllowedExternalHref("example.com")).toBeNull();
    expect(getAllowedExternalHref("/relative/path")).toBeNull();
  });
});
