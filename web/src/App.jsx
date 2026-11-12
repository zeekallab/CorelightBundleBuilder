import React, { useState, useRef } from "react";
import PackageList from "./components/PackageList.jsx";
import ManifestPaste from "./components/ManifestPaste.jsx";
import FleetPanel from "./components/FleetPanel.jsx";
import LogPanel from "./components/LogPanel.jsx";
import Results from "./components/Results.jsx";

const DEFAULT_FLEET = { host: "", username: "", password: "", ignoreTls: false, policyName: "" };

export default function App() {
  const [name, setName] = useState("custom-bundle");
  const [description, setDescription] = useState("");
  const [packages, setPackages] = useState([{ url: "", ref: "main" }]);
  const [gitToken, setGitToken] = useState("");
  const [seedIds, setSeedIds] = useState([]);
  const [seedInfo, setSeedInfo] = useState(null);
  const [fleetEnabled, setFleetEnabled] = useState(false);
  const [fleet, setFleet] = useState(DEFAULT_FLEET);
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState([]);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [runId, setRunId] = useState(null);
  const esRef = useRef(null);

  async function onSeedFile(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setError(null);
    try {
      // Extract every selected bundle, then merge their package lists into
      // one list - a url+ref already seen from an earlier file in the
      // selection is kept once (first file wins), matching how a single
      // reused row already behaves.
      const seenKeys = new Set();
      const mergedPackages = [];
      const newSeedIds = [];
      const perFile = [];

      for (const file of files) {
        const form = new FormData();
        form.set("file", file);
        const res = await fetch("/api/bundle/extract", { method: "POST", body: form });
        const body = await res.json();
        if (!res.ok) throw new Error(`${file.name}: ${body.error || "extract failed"}`);

        newSeedIds.push(body.seedId);
        perFile.push({ fileName: file.name, count: body.packages.length });

        for (const p of body.packages) {
          const key = `${p.url}@@${p.ref}`;
          if (seenKeys.has(key)) continue;
          seenKeys.add(key);
          // fromSeed marks a row as still exactly what a loaded bundle had -
          // only these are eligible for reuse. Deleting a row and re-adding
          // it (even with the identical URL) always produces a plain row
          // with no marker, which forces a fresh pull of the current tip.
          mergedPackages.push({ url: p.url, ref: p.ref, fromSeed: true });
        }
      }

      setSeedIds(newSeedIds);
      setSeedInfo({ perFile, totalCount: mergedPackages.length });
      setPackages(mergedPackages.length ? mergedPackages : [{ url: "", ref: "main" }]);
    } catch (err) {
      setError(err.message);
    }
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setResults(null);
    setLines([]);

    const body = {
      name,
      description,
      packages: packages
        .filter((p) => p.url.trim())
        .map((p) => ({ url: p.url, ref: p.ref, forceFresh: !p.fromSeed })),
      seedIds: seedIds.length ? seedIds : undefined,
      fleet: fleetEnabled ? fleet : undefined,
      gitToken: gitToken.trim() || undefined,
    };

    if (body.packages.length === 0) {
      setError("add at least one package URL");
      return;
    }

    const res = await fetch("/api/bundle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "request failed");
      return;
    }

    setRunId(data.runId);
    setRunning(true);

    const es = new EventSource(`/api/bundle/stream?runId=${data.runId}`);
    esRef.current = es;
    es.onmessage = (ev) => {
      const entry = JSON.parse(ev.data);
      if (entry.type === "log") {
        setLines((prev) => [...prev, entry.line]);
      } else if (entry.type === "results") {
        setResults(entry.results);
      } else if (entry.type === "end") {
        setRunning(false);
        if (entry.status === "error") setError(entry.error);
        es.close();
      }
    };
    es.onerror = () => {
      setRunning(false);
      es.close();
    };
  }

  return (
    <div className="app">
      <header>
        <h1>Corelight Bundle Builder</h1>
        <span className="version">v{__APP_VERSION__}</span>
        <span className="credit">by zee.k for zeek</span>
      </header>

      <form onSubmit={onSubmit}>
        <section>
          <h2>Start from one or more existing bundles (optional)</h2>
          <input type="file" accept=".bundle,.tar.gz,.tgz" multiple onChange={onSeedFile} />
          {seedInfo && (
            <p className="hint">
              Loaded {seedInfo.totalCount} unique package(s) below from{" "}
              {seedInfo.perFile.map((f, i) => (
                <span key={f.fileName}>
                  {i > 0 ? ", " : ""}
                  {f.fileName} ({f.count})
                </span>
              ))}
              . Edit, remove, or add more.
            </p>
          )}
        </section>

        <section>
          <h2>Bundle details</h2>
          <label>
            Name
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            Description
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </section>

        <section>
          <h2>Git authentication (optional)</h2>
          <label>
            Personal access token
            <input
              type="password"
              placeholder="needed only to clone private repos (e.g. an internal GitLab)"
              value={gitToken}
              onChange={(e) => setGitToken(e.target.value)}
            />
          </label>
          <p className="hint">
            Only used for packages that need a fresh clone from a private repo - reused packages from a
            loaded bundle never need this. Sent directly to that repo's host, never stored.
          </p>
        </section>

        <section>
          <h2>Packages</h2>
          <ManifestPaste
            onApply={(parsed, mode) => {
              setPackages((prev) => {
                if (mode === "replace") return parsed;
                const existingKeys = new Set(prev.map((p) => `${p.url}@@${p.ref}`));
                const merged = prev.filter((p) => p.url.trim());
                for (const p of parsed) {
                  if (!existingKeys.has(`${p.url}@@${p.ref}`)) merged.push(p);
                }
                return merged.length ? merged : [{ url: "", ref: "main" }];
              });
            }}
          />
          <PackageList packages={packages} onChange={setPackages} />
        </section>

        <section>
          <h2>Fleet Manager (optional)</h2>
          <FleetPanel enabled={fleetEnabled} onToggle={setFleetEnabled} fleet={fleet} onChange={setFleet} />
        </section>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={running}>
          {running ? "Building…" : fleetEnabled ? "Build & Upload" : "Build Bundle"}
        </button>
      </form>

      {lines.length > 0 && <LogPanel lines={lines} />}
      <Results runId={runId} results={results} />
    </div>
  );
}
