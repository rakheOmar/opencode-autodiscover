export const normalizeModelId = (id: string): string => {
  let normalized = id.toLowerCase();

  if (normalized.startsWith("models/")) {
    normalized = normalized.slice(7);
  }

  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex !== -1) {
    normalized = normalized.slice(slashIndex + 1);
  }

  normalized = normalized.replaceAll(":", "-");

  return normalized;
};
