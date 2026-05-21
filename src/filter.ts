const globToRegex = (pattern: string): RegExp => {
  const escaped = pattern.replaceAll(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexStr = `^${escaped.replaceAll("*", ".*")}$`;
  return new RegExp(regexStr, "i");
};

export const matchesFilter = (
  modelId: string,
  include: string[],
  exclude: string[]
): boolean => {
  if (include.length > 0) {
    const included = include.some((p) => globToRegex(p).test(modelId));
    if (!included) {
      return false;
    }
  }

  if (exclude.length > 0) {
    const excluded = exclude.some((p) => globToRegex(p).test(modelId));
    if (excluded) {
      return false;
    }
  }

  return true;
};
