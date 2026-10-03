import {
  normalizeLinkHref,
  getAllowedExternalHref,
  getAllowedImageHref,
  type UrlSafetyOptions,
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
    expect(
      getAllowedImageHref("https://assets.example.com.evil/image.png", {
        allowedHosts: ["assets.example.com"],
      }),
    ).toBeNull();
  });

  it("denies every remote image when the configured host list is empty", () => {
    expect(
      getAllowedImageHref("https://example.com/image.png", {
        allowedHosts: [],
      }),
    ).toBeNull();
  });

  it("treats a null host list from untyped callers like an omitted one", () => {
    expect(
      getAllowedImageHref("https://example.com/image.png", {
        allowedHosts: null,
      } as unknown as UrlSafetyOptions),
    ).toBe("https://example.com/image.png");
  });

  it("denies images when no configured host normalizes to a valid hostname", () => {
    expect(
      getAllowedImageHref("https://example.com/image.png", {
        allowedHosts: ["invalid host!"],
      }),
    ).toBeNull();
  });

  it("filters the complete bracketed IPv6 host", () => {
    expect(
      getAllowedImageHref("https://[2001:db8::1]/image.png", {
        allowedHosts: ["2001:db8::1"],
      }),
    ).toBe("https://[2001:db8::1]/image.png");
    expect(
      getAllowedImageHref("https://[2001:db8::2]/image.png", {
        allowedHosts: ["2001:db8::1"],
      }),
    ).toBeNull();
    expect(
      getAllowedImageHref("https://[2001:db8::1]/image.png", {
        allowedHosts: ["[2001:db8::1]"],
      }),
    ).toBe("https://[2001:db8::1]/image.png");
    expect(
      getAllowedImageHref("https://[2001:db8::1]/image.png", {
        allowedHosts: ["2001"],
      }),
    ).toBeNull();
    expect(
      getAllowedImageHref("https://2001:db8::1/image.png", {
        allowedHosts: ["2001:db8::1"],
      }),
    ).toBeNull();
  });

  it("matches normalized DNS and IPv4 hosts while ignoring valid ports", () => {
    expect(
      getAllowedImageHref(
        "https://ASSETS.Example.COM:443/image.png",
        { allowedHosts: ["assets.example.com"] },
      ),
    ).toBe("https://ASSETS.Example.COM:443/image.png");
    expect(
      getAllowedImageHref("http://192.0.2.17:8080/image.png", {
        allowedHosts: ["192.0.2.17"],
      }),
    ).toBe("http://192.0.2.17:8080/image.png");
    expect(
      getAllowedImageHref("http://192.0.2.18/image.png", {
        allowedHosts: ["192.0.2.17"],
      }),
    ).toBeNull();
  });

  it("rejects a backslash authority before extracting userinfo", () => {
    const href = "https://notallowed.example\\@allowed.example/image.png";
    expect(new URL(href).hostname).toBe("notallowed.example");
    expect(getAllowedImageHref(href, { allowedHosts: ["allowed.example"] })).toBeNull();
  });

  it("checks the host after userinfo and rejects malformed authorities", () => {
    expect(
      getAllowedImageHref(
        "https://user:pass@assets.example.com:8443/image.png",
        { allowedHosts: ["assets.example.com"] },
      ),
    ).toBe("https://user:pass@assets.example.com:8443/image.png");

    for (const href of [
      "https://[2001:db8::1/image.png",
      "https://[2001:db8::1]suffix/image.png",
      "https://assets.example.com:abc/image.png",
      "https://assets.example.com:65536/image.png",
      "https://assets.example.com:443:444/image.png",
      "https://assets..example.com/image.png",
      "https://@/image.png",
    ]) {
      expect(
        getAllowedImageHref(href, { allowedHosts: ["assets.example.com"] }),
      ).toBeNull();
    }
  });

  it.each([
    ["https://[::ffff:192.0.2.1]/image.png", "::ffff:192.0.2.1"],
    ["https://[2001:db8:0:0:0:0:0:1]:443/image.png", "2001:db8:0:0:0:0:0:1"],
    ["https://assets.example.com./image.png", "assets.example.com"],
  ])("accepts a valid normalized authority %s", (href, host) => {
    expect(getAllowedImageHref(href, { allowedHosts: [host] })).toBe(href);
  });

  it.each([
    "https://[::ffff:999.0.2.1]/image.png",
    "https://[192.0.2.1]/image.png",
    "https://[1::2::3]/image.png",
    "https://[:::1]/image.png",
    "https://[:1:2:3:4:5:6:7:8]/image.png",
    "https://[1:2:3:4:5:6:7:8:]/image.png",
    "https://[fe80::1%25eth0]/image.png",
    "https://[gggg::1]/image.png",
    "https://[1:2:3:4:5:6:7]/image.png",
    "https://[1:2:3:4:5:6:7:8:9]/image.png",
    "https://[1:2:3:4:5:6:7::8]/image.png",
    "https://192.00.2.1/image.png",
    "https://999.0.2.1/image.png",
    "https://192.0.2/image.png",
    "https://assets[.example.com/image.png",
    "https://-assets.example.com/image.png",
    "https://assets .example.com/image.png",
    `https://${"a".repeat(64)}.example.com/image.png`,
    `https://${"a.".repeat(128)}com/image.png`,
  ])("rejects malformed IP and DNS authorities %s", (href) => {
    expect(getAllowedImageHref(href)).toBeNull();
  });

  it("rejects hostless absolute image URLs when hosts are restricted", () => {
    expect(
      getAllowedImageHref("https:image.png", {
        allowedHosts: ["assets.example.com"],
      }),
    ).toBeNull();
  });

  it("rejects all remote images when remoteImages is deny", () => {
    expect(
      getAllowedImageHref("https://example.com/image.png", {
        remoteImages: "deny",
      }),
    ).toBeNull();
    expect(
      getAllowedImageHref("http://example.com/image.png", {
        remoteImages: "deny",
      }),
    ).toBeNull();
  });

  it("allows remote images by default for compatibility", () => {
    expect(
      getAllowedImageHref("https://example.com/image.png"),
    ).toBe("https://example.com/image.png");
  });

  it("remoteImages deny wins over configured allowlists", () => {
    expect(
      getAllowedImageHref("https://assets.example.com/image.png", {
        allowedHosts: ["assets.example.com"],
        remoteImages: "deny",
      }),
    ).toBeNull();
  });
});
