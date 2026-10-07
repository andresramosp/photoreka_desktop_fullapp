// Standalone anonymous products: they never use the main app's session, so the
// profile is not loaded for them (it would only delay their first paint).
const ANONYMOUS_PATH_PREFIXES = ["/picks", "/geo-recovery"];

export function isAnonymousProductPath(path: string): boolean {
  return ANONYMOUS_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}
