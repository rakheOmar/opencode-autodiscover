const VALID_PROTOCOLS = new Set(["http:", "https:"]);

export const isValidUrl = (url: string): boolean => {
  if (url.includes("${") || url.includes("}")) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return VALID_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
};

export const sanitizeModelId = (id: string): string =>
  id.replaceAll(/[^a-zA-Z0-9/_\-:.]/gu, "_");

export const sanitizeErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replaceAll(/Bearer\s+[^\s]+/giu, "Bearer [REDACTED]")
    .replaceAll(/api[_-]?key[=:]\s*[^\s&]+/giu, "api_key=[REDACTED]")
    .replaceAll(/sk-[a-zA-Z0-9]+/gu, "sk-[REDACTED]");
};
