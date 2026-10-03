const ALLOWED_LINK_PROTOCOLS = new Set([
  "http:",
  "https:",
  "mailto:",
  "tel:",
  "sms:",
]);

const DEFAULT_IMAGE_PROTOCOLS = ["http:", "https:"] as const;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;
const DNS_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const IPV6_GROUP_PATTERN = /^[0-9a-f]{1,4}$/i;

export type UrlSafetyOptions = {
  allowedProtocols?: readonly string[];
  /**
   * Restricts image URLs to complete normalized hostnames.
   * - An empty list denies every host.
   * - Omitting the property retains the default host policy.
   */
  allowedHosts?: readonly string[];
  /**
   * Remote image loading policy.
   * - `"allow"` (default): remote http(s) images load, matching legacy behavior.
   * - `"deny"`: no remote image is ever loaded; image nodes render their
   *   error/alt state instead. Use this in privacy- or SSRF-sensitive apps
   *   that render untrusted markdown.
   */
  remoteImages?: "allow" | "deny";
};

export const normalizeLinkHref = (href: string): string | null => {
  const normalizedHref = href.trim();
  if (CONTROL_CHARACTER_PATTERN.test(normalizedHref)) return null;
  return normalizedHref.length > 0 ? normalizedHref : null;
};

const isValidIpv4 = (hostname: string): boolean => {
  if (!IPV4_PATTERN.test(hostname)) return false;

  return hostname.split(".").every((part) => {
    if (part.length > 1 && part.startsWith("0")) return false;
    const octet = Number(part);
    return Number.isInteger(octet) && octet <= 255;
  });
};

const isValidIpv6 = (hostname: string): boolean => {
  if (
    hostname.includes("%") || hostname.includes(":::") ||
    (hostname.startsWith(":") && !hostname.startsWith("::")) ||
    (hostname.endsWith(":") && !hostname.endsWith("::"))
  ) return false;

  let address = hostname;
  if (address.includes(".")) {
    const ipv4Separator = address.lastIndexOf(":");
    if (
      ipv4Separator < 0 ||
      !isValidIpv4(address.slice(ipv4Separator + 1))
    ) {
      return false;
    }
    address = `${address.slice(0, ipv4Separator)}:0:0`;
  }

  const compressionIndex = address.indexOf("::");
  if (
    compressionIndex >= 0 &&
    address.indexOf("::", compressionIndex + 2) >= 0
  ) {
    return false;
  }

  const left = compressionIndex >= 0
    ? address.slice(0, compressionIndex)
    : address;
  const right = compressionIndex >= 0
    ? address.slice(compressionIndex + 2)
    : "";
  const groups = [...left.split(":").filter(Boolean), ...right.split(":").filter(Boolean)];
  if (!groups.every((group) => IPV6_GROUP_PATTERN.test(group))) return false;

  return compressionIndex >= 0 ? groups.length < 8 : groups.length === 8;
};

const normalizeHostname = (hostname: string): string | null => {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (normalized.length === 0 || normalized.length > 253) return null;

  if (normalized.includes(":")) {
    return isValidIpv6(normalized) ? normalized : null;
  }
  if (/^[0-9.]+$/.test(normalized)) {
    return isValidIpv4(normalized) ? normalized : null;
  }

  const labels = normalized.split(".");
  if (
    labels.some(
      (label) =>
        label.length === 0 ||
        label.length > 63 ||
        !DNS_LABEL_PATTERN.test(label),
    )
  ) {
    return null;
  }

  return normalized;
};

const parsePort = (suffix: string): boolean => {
  if (suffix.length === 0) return true;
  if (!/^:\d+$/.test(suffix)) return false;
  return Number(suffix.slice(1)) <= 65535;
};

const parseAuthorityHostname = (authority: string): string | null => {
  if (authority.includes("\\")) return null;
  const atIndex = authority.lastIndexOf("@");
  const hostPort = authority.slice(atIndex + 1);
  if (hostPort.length === 0 || /[\\\s]/.test(hostPort)) return null;

  if (hostPort.startsWith("[")) {
    const closingBracket = hostPort.indexOf("]");
    if (closingBracket < 0) return null;

    const hostname = hostPort.slice(1, closingBracket);
    if (!isValidIpv6(hostname)) return null;
    if (!parsePort(hostPort.slice(closingBracket + 1))) return null;
    return hostname.toLowerCase();
  }

  if (hostPort.includes("[") || hostPort.includes("]")) return null;
  const colonIndex = hostPort.indexOf(":");
  const hostname = colonIndex < 0 ? hostPort : hostPort.slice(0, colonIndex);
  const port = colonIndex < 0 ? "" : hostPort.slice(colonIndex);
  if (hostPort.indexOf(":", colonIndex + 1) >= 0 || !parsePort(port)) {
    return null;
  }

  return normalizeHostname(hostname);
};

const parseAbsoluteHref = (
  href: string,
): { protocol: string; hostname: string } | null => {
  const protocolMatch = href.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!protocolMatch) return null;

  const protocol = normalizeProtocol(protocolMatch[1] ?? "");
  const rest = href.slice(protocolMatch[0].length);
  const authorityMatch = rest.match(/^\/\/([^/?#]*)/);
  const authority = authorityMatch?.[1];
  const hostname = authority === undefined ? "" : parseAuthorityHostname(authority);
  if (authority !== undefined && hostname === null) return null;
  if ((protocol === "http:" || protocol === "https:") && !hostname) {
    return null;
  }

  return { protocol, hostname: hostname ?? "" };
};

const normalizeProtocol = (protocol: string): string => {
  const normalized = protocol.trim().toLowerCase();
  return normalized.endsWith(":") ? normalized : `${normalized}:`;
};

export const getAllowedExternalHref = (href: string): string | null => {
  const normalizedHref = normalizeLinkHref(href);
  if (!normalizedHref) return null;

  const parsed = parseAbsoluteHref(normalizedHref);
  if (!parsed) return null;

  if (!ALLOWED_LINK_PROTOCOLS.has(parsed.protocol)) return null;

  return normalizedHref;
};

export const getAllowedImageHref = (
  href: string,
  options?: UrlSafetyOptions,
): string | null => {
  const normalizedHref = normalizeLinkHref(href);
  if (!normalizedHref) return null;

  if (options?.remoteImages === "deny") {
    return null;
  }

  const parsed = parseAbsoluteHref(normalizedHref);
  if (!parsed) return null;

  const allowedProtocols = new Set(
    (options?.allowedProtocols ?? DEFAULT_IMAGE_PROTOCOLS).map(
      normalizeProtocol,
    ),
  );
  if (!allowedProtocols.has(parsed.protocol)) return null;

  const allowedHosts = options?.allowedHosts;
  if (Array.isArray(allowedHosts)) {
    const allowedHostSet = new Set(
      allowedHosts
        .map((host) => {
          const normalizedHost = host.trim().replace(/^\[|\]$/g, "");
          return normalizeHostname(normalizedHost);
        })
        .filter((host): host is string => host !== null),
    );
    if (!allowedHostSet.has(parsed.hostname)) return null;
  }

  return normalizedHref;
};
