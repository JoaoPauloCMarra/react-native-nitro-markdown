import {
  normalizeLinkHref,
  getAllowedExternalHref,
  getAllowedImageHref,
} from "../utils/link-security";

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

  it("rejects control characters", () => {
    expect(normalizeLinkHref("https://example.com/\nnext")).toBeNull();
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

describe("getAllowedImageHref", () => {
  it.each(["https://example.com/image.png", "http://example.com/image.png"])(
    "allows %s by default",
    (href) => {
      expect(getAllowedImageHref(href)).toBe(href);
    },
  );

  it.each(["data:image/png;base64,abc", "file:///tmp/image.png", "javascript:alert(1)"])(
    "rejects %s by default",
    (href) => {
      expect(getAllowedImageHref(href)).toBeNull();
    },
  );

  it("allows configured protocols", () => {
    expect(
      getAllowedImageHref("data:image/png;base64,abc", {
        allowedProtocols: ["https", "data"],
      }),
    ).toBe("data:image/png;base64,abc");
  });

  it("filters configured hosts", () => {
    expect(
      getAllowedImageHref("https://assets.example.com/image.png", {
        allowedHosts: ["assets.example.com"],
      }),
    ).toBe("https://assets.example.com/image.png");
    expect(
      getAllowedImageHref("https://evil.example.com/image.png", {
        allowedHosts: ["assets.example.com"],
      }),
    ).toBeNull();
  });

  it("normalizes credentials and IPv6 brackets before host filtering", () => {
    expect(
      getAllowedImageHref("https://user:pass@assets.example.com/image.png", {
        allowedHosts: ["assets.example.com"],
      }),
    ).toBe("https://user:pass@assets.example.com/image.png");
    expect(
      getAllowedImageHref("https://[2001:db8::1]/image.png", {
        allowedHosts: ["2001"],
      }),
    ).toBe("https://[2001:db8::1]/image.png");
  });

  it("rejects hostless absolute image URLs when hosts are restricted", () => {
    expect(
      getAllowedImageHref("https:image.png", {
        allowedHosts: ["assets.example.com"],
      }),
    ).toBeNull();
  });
});
