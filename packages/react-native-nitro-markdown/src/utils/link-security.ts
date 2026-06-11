const ALLOWED_LINK_PROTOCOLS = new Set([
  "http:",
  "https:",
  "mailto:",
  "tel:",
  "sms:",
]);

const DEFAULT_IMAGE_PROTOCOLS = ["http:", "https:"] as const;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

export type UrlSafetyOptions = {
  allowedProtocols?: readonly string[];
  allowedHosts?: readonly string[];
};

export const normalizeLinkHref = (href: string): string | null => {
  const normalizedHref = href.trim();
  if (CONTROL_CHARACTER_PATTERN.test(normalizedHref)) return null;
  return normalizedHref.length > 0 ? normalizedHref : null;
};

const parseAbsoluteHref = (
  href: string,
): { protocol: string; hostname: string } | null => {
  const protocolMatch = href.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!protocolMatch) return null;

  const protocol = normalizeProtocol(protocolMatch[1] ?? "");
  const rest = href.slice(protocolMatch[0].length);
  const authorityMatch = rest.match(/^\/\/([^/?#]*)/);
  const rawHost = authorityMatch?.[1] ?? "";
  const hostname = (rawHost
    .replace(/^[^@]*@/, "")
    .replace(/^\[|\]$/g, "")
    .split(":")[0] ?? "")
    .toLowerCase();

  return { protocol, hostname };
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

  const parsed = parseAbsoluteHref(normalizedHref);
  if (!parsed) return null;

  const allowedProtocols = new Set(
    (options?.allowedProtocols ?? DEFAULT_IMAGE_PROTOCOLS).map(
      normalizeProtocol,
    ),
  );
  if (!allowedProtocols.has(parsed.protocol)) return null;

  const allowedHosts = options?.allowedHosts;
  if (allowedHosts && allowedHosts.length > 0) {
    const normalizedHost = parsed.hostname.toLowerCase();
    const allowedHostSet = new Set(
      allowedHosts.map((host) => host.trim().toLowerCase()).filter(Boolean),
    );
    if (!allowedHostSet.has(normalizedHost)) return null;
  }

  return normalizedHref;
};
