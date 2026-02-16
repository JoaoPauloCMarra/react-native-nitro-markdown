import {
  getAllowedExternalHref,
  normalizeLinkHref,
} from "../utils/link-security";

describe("link security utilities", () => {
  describe("normalizeLinkHref", () => {
    it("returns null for empty href values", () => {
      expect(normalizeLinkHref("")).toBeNull();
      expect(normalizeLinkHref("   ")).toBeNull();
    });

    it("trims non-empty href values", () => {
      expect(normalizeLinkHref("  https://example.com  ")).toBe(
        "https://example.com",
      );
    });
  });

  describe("getAllowedExternalHref", () => {
    it("allows supported protocols", () => {
      expect(getAllowedExternalHref("https://example.com")).toBe(
        "https://example.com",
      );
      expect(getAllowedExternalHref("mailto:dev@example.com")).toBe(
        "mailto:dev@example.com",
      );
      expect(getAllowedExternalHref("TEL:+123456789")).toBe("TEL:+123456789");
    });

    it("rejects unsupported protocols", () => {
      expect(getAllowedExternalHref("javascript:alert(1)")).toBeNull();
      expect(getAllowedExternalHref("file:///tmp/a")).toBeNull();
      expect(getAllowedExternalHref("data:text/plain,abc")).toBeNull();
    });

    it("rejects links without explicit protocol", () => {
      expect(getAllowedExternalHref("/internal/path")).toBeNull();
      expect(getAllowedExternalHref("#local-anchor")).toBeNull();
    });
  });
});

