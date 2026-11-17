// Normalizes a package git URL for duplicate comparison - trims whitespace,
// drops a trailing slash and/or ".git" suffix, so
// "https://github.com/org/repo" and "https://github.com/org/repo.git/" are
// recognized as the same package. Returns "" for an empty/blank url.
export function normalizePackageUrl(url) {
  if (!url) return "";
  return url.trim().replace(/\/+$/, "").replace(/\.git$/i, "").toLowerCase();
}
