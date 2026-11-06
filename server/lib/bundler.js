import fs from "node:fs";
import path from "node:path";
import http from "isomorphic-git/http/node";
import git from "isomorphic-git";
import * as tar from "tar";
import zlib from "node:zlib";

// A network/auth failure will fail identically on every retry, so detect it
// up front and stop immediately with the real reason instead of cycling
// through all three strategies and masking it behind "not a branch or tag".
function describeFatal(e) {
  const msg = e.message || String(e);
  if (/401|403|Unauthorized|Forbidden/i.test(msg)) {
    return `authentication required to clone this repo - this URL isn't publicly reachable (${msg})`;
  }
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|network/i.test(msg)) {
    return `network error reaching this repo (${msg})`;
  }
  return null;
}

// Clone a package repo at a specific ref (branch, tag, or full commit hash).
// Mirrors corelight-update's Clone()+Checkout() fallback order: local branch,
// remote branch, tag, then (only if ref is a full commit hash) a deeper fetch.
export async function cloneAndCheckout(dir, url, ref, emit) {
  fs.mkdirSync(dir, { recursive: true });

  // Try a shallow single-branch clone using ref directly as a branch name.
  try {
    await git.clone({ fs, http, dir, url, ref, singleBranch: true, depth: 1 });
    emit?.(`cloned ${url} @ ${ref} (branch)`);
    return;
  } catch (e) {
    const fatal = describeFatal(e);
    if (fatal) throw new Error(`cloning ${url}: ${fatal}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }

  // Try cloning default branch shallowly, then fetching+checking out ref as a tag.
  try {
    await git.clone({ fs, http, dir, url, singleBranch: false, depth: 1, noCheckout: true });
    await git.fetch({ fs, http, dir, url, ref, singleBranch: true, depth: 1, tags: true });
    await git.checkout({ fs, dir, ref });
    emit?.(`cloned ${url} @ ${ref} (tag)`);
    return;
  } catch (e) {
    const fatal = describeFatal(e);
    if (fatal) throw new Error(`cloning ${url}: ${fatal}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }

  // Last resort: if ref looks like a full commit hash, try a deeper fetch and
  // checkout by oid. Shallow server-side support for arbitrary commits is not
  // guaranteed; this mirrors the same documented limitation in corelight-update.
  if (/^[0-9a-f]{40}$/i.test(ref)) {
    try {
      await git.clone({ fs, http, dir, url, singleBranch: false, depth: 50, noCheckout: true });
      await git.checkout({ fs, dir, ref });
      emit?.(`cloned ${url} @ ${ref} (commit)`);
      return;
    } catch (e) {
      const fatal = describeFatal(e);
      throw new Error(
        fatal
          ? `cloning ${url}: ${fatal}`
          : `checking out commit ${ref} in ${url}: only commits at the tip of a branch or tag are reliably available in a shallow clone (${e.message})`
      );
    }
  }

  throw new Error(`${ref} is not a branch or tag in ${url}`);
}

// Parse manifest.txt's [bundle] section (ini-style "<url> = <ref>" lines)
// back into {url, ref} pairs.
export function parseManifest(text) {
  const rawLines = text.split(/\r?\n/);
  const hasAnyHeader = rawLines.some((l) => {
    const t = l.trim();
    return t.startsWith("[") && t.endsWith("]");
  });
  const packages = [];
  let inBundleSection = !hasAnyHeader;
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

export function buildManifest(packages) {
  const lines = ["[bundle]"];
  for (const pkg of packages) {
    lines.push(`${pkg.url} = ${pkg.ref}`);
  }
  return lines.join("\n") + "\n";
}

// corelight-update names each package directory after the URL's last path
// segment (Go: `pkg.Name = filepath.Base(url)`, see
// corelightPackageManager/packageManager.go GeneratePackageList). Matching
// that convention exactly - rather than guessing - is what makes a package
// already inside a loaded bundle reliably reusable without ever needing to
// reach its source repo (customers can't reach Corelight's internal GitLab,
// so an unchanged row must never require a network call).
function dirNameFor(url) {
  const trimmed = url.trim().replace(/\/+$/, "");
  const base = trimmed.slice(trimmed.lastIndexOf("/") + 1).replace(/\.git$/, "");
  return base || "package";
}

// Extract an existing .bundle (tar.gz) file into seedDir and return the
// package list recovered from its manifest.txt.
export async function extractBundle(bundlePath, seedDir) {
  fs.mkdirSync(seedDir, { recursive: true });
  await tar.x({ file: bundlePath, cwd: seedDir, gzip: true });
  const manifestPath = path.join(seedDir, "manifest.txt");
  if (!fs.existsSync(manifestPath)) {
    throw new Error("uploaded file has no manifest.txt - it doesn't look like a Corelight bundle");
  }
  const packages = parseManifest(fs.readFileSync(manifestPath, "utf8"));
  return packages.map((pkg) => {
    const expectedDir = path.join(seedDir, dirNameFor(pkg.url));
    return { ...pkg, _seedDir: fs.existsSync(expectedDir) ? expectedDir : null };
  });
}

// Build a bundle from the requested package list, reusing any row that
// exactly matches a seed-extracted package (no re-clone), cloning fresh
// otherwise. Writes manifest.txt + tars the whole pkgs dir, gzipped.
export async function buildBundle({ runDir, name, packages, seed }, emit) {
  const pkgsDir = path.join(runDir, "pkgs");
  fs.mkdirSync(pkgsDir, { recursive: true });

  const seedByUrl = new Map();
  if (seed) {
    for (const p of seed) seedByUrl.set(`${p.url}@@${p.ref}`, p);
  }

  const finalPackages = [];
  const usedDirNames = new Set();
  for (const pkg of packages) {
    const url = pkg.url.trim();
    const ref = (pkg.ref || "main").trim() || "main";
    let dirName = dirNameFor(url);
    // Guard against two different URLs sharing the same basename within one
    // build (rare, but would otherwise silently overwrite one package with
    // another inside pkgsDir).
    let suffix = 2;
    while (usedDirNames.has(dirName)) {
      dirName = `${dirNameFor(url)}-${suffix++}`;
    }
    usedDirNames.add(dirName);
    const destDir = path.join(pkgsDir, dirName);
    // forceFresh marks a row the UI knows was deleted and retyped (not just
    // left untouched) - that's the user's signal to pull the current branch
    // tip again rather than reuse whatever was in the loaded bundle, even
    // though the url+ref happen to match.
    const seeded = pkg.forceFresh ? null : seedByUrl.get(`${url}@@${ref}`);

    if (seeded && seeded._seedDir && fs.existsSync(seeded._seedDir)) {
      fs.cpSync(seeded._seedDir, destDir, { recursive: true });
      emit?.(`reused ${url} @ ${ref} (from existing bundle)`);
    } else {
      emit?.(`cloning ${url} @ ${ref} ...`);
      await cloneAndCheckout(destDir, url, ref, emit);
    }
    finalPackages.push({ url, ref });
  }

  fs.writeFileSync(path.join(pkgsDir, "manifest.txt"), buildManifest(finalPackages));

  const bundleFileName = `${name}.bundle`;
  const bundlePath = path.join(runDir, bundleFileName);
  await tar.c(
    { gzip: true, file: bundlePath, cwd: pkgsDir, portable: true },
    fs.readdirSync(pkgsDir)
  );

  const stat = fs.statSync(bundlePath);
  emit?.(`bundle built: ${bundleFileName} (${stat.size} bytes)`);
  return { bundlePath, bundleFileName, size: stat.size };
}
