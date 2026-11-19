// Parse pasted manifest-style text into {url, ref} pairs. Accepts the exact
// manifest.txt format (an optional "[bundle]" header, "<url> = <ref>" lines)
// as well as bare "<url> = <ref>" lines with no header at all, so a user can
// paste either a full manifest.txt or just a quick list they typed up.
export function parseManifestText(text) {
  const rawLines = (text || "").split(/\r?\n/);
  const hasAnyHeader = rawLines.some((l) => {
    const t = l.trim();
    return t.startsWith("[") && t.endsWith("]");
  });

  const packages = [];
  let inBundleSection = !hasAnyHeader; // no header at all -> treat every line as the bundle

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line || line.startsWith(";") || line.startsWith("#")) continue;
    if (line.startsWith("[") && line.endsWith("]")) {
      inBundleSection = line.slice(1, -1).trim().toLowerCase() === "bundle";
      continue;
    }
    if (!inBundleSection) continue;
    const idx = line.indexOf("=");
    if (idx === -1) continue;
    const url = line.slice(0, idx).trim();
    const ref = line.slice(idx + 1).trim();
    if (url) packages.push({ url, ref: ref || "main" });
  }
  return packages;
}
