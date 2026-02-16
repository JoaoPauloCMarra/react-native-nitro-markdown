const ALLOWED_LINK_PROTOCOLS = new Set([
  "http:",
  "https:",
  "mailto:",
  "tel:",
  "sms:",
]);

export const normalizeLinkHref = (href: string): string | null => {
  const normalizedHref = href.trim();
  return normalizedHref.length > 0 ? normalizedHref : null;
};

export const getAllowedExternalHref = (href: string): string | null => {
  const protocolMatch = href.match(/^([a-z][a-z0-9+.-]*):/i);
  if (!protocolMatch) return null;

  const protocol = `${protocolMatch[1].toLowerCase()}:`;
  if (!ALLOWED_LINK_PROTOCOLS.has(protocol)) return null;

  return href;
};
