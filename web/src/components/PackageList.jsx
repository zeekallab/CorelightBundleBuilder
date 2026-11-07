import React from "react";

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

  return (
    <div className="package-list">
      <div className="package-list-header">
        <span>Package git URL</span>
        <span>Branch / tag / commit</span>
        <span />
      </div>
      {packages.map((pkg, i) => (
        <div className="package-row" key={i}>
          <input
            type="text"
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
      ))}
      <button type="button" className="add-row" onClick={add}>
        + Add package
      </button>
    </div>
  );
}
