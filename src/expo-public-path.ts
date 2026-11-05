export function normalizeExpoPublicPath(value: string): string | undefined {
  if (value === "/") return value;
  const normalized = value.replace(/\/$/u, "");
  if (
    !normalized.startsWith("/") ||
    normalized
      .slice(1)
      .split("/")
      .some((segment) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(segment))
  )
    return undefined;
  return normalized;
}
