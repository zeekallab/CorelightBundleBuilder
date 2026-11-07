import React, { useState } from "react";
import { parseManifestText } from "../lib/parseManifestText.js";

export default function ManifestPaste({ onApply }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("replace"); // "replace" | "append"
  const [status, setStatus] = useState(null);

  function apply() {
    const parsed = parseManifestText(text);
    if (parsed.length === 0) {
      setStatus("No package lines found. Expected lines like: https://github.com/org/repo = main");
      return;
    }
    onApply(parsed, mode);
    setStatus(`Added ${parsed.length} package(s).`);
    setText("");
  }

  return (
    <div className="manifest-paste">
      <textarea
        rows={6}
        placeholder={
          "Paste a manifest here, one package per line, e.g.\n" +
          "https://github.com/corelight/example-package = main\n" +
          "https://github.com/corelight/another-package = v1.2.0\n" +
          "(an optional leading [bundle] line is fine too)"
        }
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="manifest-paste-actions">
        <label className="radio-row">
          <input type="radio" name="paste-mode" checked={mode === "replace"} onChange={() => setMode("replace")} />
          Replace current list
        </label>
        <label className="radio-row">
          <input type="radio" name="paste-mode" checked={mode === "append"} onChange={() => setMode("append")} />
          Add to current list
        </label>
        <button type="button" onClick={apply} disabled={!text.trim()}>
          Parse &amp; add
        </button>
      </div>
      {status && <p className="hint">{status}</p>}
    </div>
  );
}
