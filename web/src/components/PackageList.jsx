import React from "react";
import { normalizePackageUrl } from "../lib/normalizePackageUrl.js";

export default function PackageList({ packages, onChange }) {
  function update(i, field, value) {
    const next = packages.slice();
    next[i] = { ...next[i], [field]: value };
    onChange(next);
  }

  function add() {
    onChange([...packages, { url: "", ref: "main" }]);
  }

  function remove(i) {
    const next = packages.slice();
    next.splice(i, 1);
    onChange(next.length ? next : [{ url: "", ref: "main" }]);
  }

  // Two rows pointing at the same repo load the same script twice on the
  // sensor - flag every row sharing a URL with another non-empty row so this
  // is visible before Build Bundle is even clicked, not just at submit time.
  const seen = new Map();
  for (const pkg of packages) {
    const key = normalizePackageUrl(pkg.url);
    if (!key) continue;
    seen.set(key, (seen.get(key) || 0) + 1);
  }

  return (
    <div className="package-list">
      <div className="package-list-header">
        <span>Package git URL</span>
        <span>Branch / tag / commit</span>
        <span />
      </div>
      {packages.map((pkg, i) => {
        const key = normalizePackageUrl(pkg.url);
        const isDuplicate = key && seen.get(key) > 1;
        return (
          <div className="package-row" key={i}>
            <input
              type="text"
              className={isDuplicate ? "input-duplicate" : undefined}
              placeholder="https://github.com/corelight/example-package"
              value={pkg.url}
              onChange={(e) => update(i, "url", e.target.value)}
            />
            <input
              type="text"
              placeholder="main"
              value={pkg.ref}
              onChange={(e) => update(i, "ref", e.target.value)}
            />
            <button type="button" className="row-remove" onClick={() => remove(i)} aria-label="Remove">
              ✕
            </button>
          </div>
        );
      })}
      {Array.from(seen.values()).some((count) => count > 1) && (
        <p className="error">
          Duplicate package URL(s) above - the same script would be loaded more than once. Remove the extra row(s).
        </p>
      )}
      <button type="button" className="add-row" onClick={add}>
        + Add package
      </button>
    </div>
  );
}
