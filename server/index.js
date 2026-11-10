import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createRun,
  attach,
  unsubscribe,
  getRun,
  extractSeed,
  runDirFor,
  getSeedPackages,
} from "./lib/runner.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: "5mb" }));

// A Finder/Dock-launched packaged app's process.cwd() is NOT the app's own
// directory (often "/", which is read-only) - never derive a writable path
// from it. Electron sets CBB_UPLOADS_DIR to a real writable location when
// packaged; dev (plain `node server/index.js`) falls back to cwd-relative.
const uploadsDir = process.env.CBB_UPLOADS_DIR || path.join(process.cwd(), "uploads");
fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({ dest: uploadsDir });

// Electron launches this module directly (not via `npm run`), so
// npm_package_version is never set there - read package.json instead of
// relying on an env var that's only present in some launch paths.
const { version: APP_VERSION } = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));

app.get("/api/health", (req, res) => {
  res.json({ ok: true, version: APP_VERSION });
});

app.post("/api/bundle/extract", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "no file uploaded" });
  try {
    const result = await extractSeed(req.file.path);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  } finally {
    fs.rm(req.file.path, { force: true }, () => {});
  }
});

function isHttpGitUrl(url) {
  return typeof url === "string" && /^https?:\/\/.+/.test(url.trim());
}

app.post("/api/bundle", (req, res) => {
  const { name, description, packages, seedId, fleet } = req.body || {};

  if (!Array.isArray(packages) || packages.length === 0) {
    return res.status(400).json({ error: "at least one package is required" });
  }

  // Only rows that will actually need a fresh clone must look like a real
  // http(s) git URL. A row left unchanged from a loaded existing bundle is
  // reused as-is (no clone), so it's validated at build time instead - real
  // bundles can carry non-URL package identifiers (e.g. an internal package
  // registry path) that are still perfectly valid to reuse untouched.
  const seedPackages = seedId ? getSeedPackages(seedId) : null;
  const seedKeys = new Set((seedPackages || []).map((p) => `${p.url}@@${p.ref}`));
  for (const pkg of packages) {
    if (!pkg.url || !pkg.url.trim()) {
      return res.status(400).json({ error: "every package needs a URL" });
    }
    const ref = (pkg.ref || "main").trim() || "main";
    const willReuse = !pkg.forceFresh && seedKeys.has(`${pkg.url.trim()}@@${ref}`);
    if (!willReuse && !isHttpGitUrl(pkg.url)) {
      return res.status(400).json({ error: `not a valid http(s) git URL: ${pkg.url}` });
    }
  }
  if (fleet) {
    if (!fleet.host || !fleet.username || !fleet.password) {
      return res.status(400).json({ error: "Fleet host, username, and password are required to upload" });
    }
  }

  const run = createRun({ name, description, packages, seedId, fleet });
  res.json({ runId: run.id });
});

app.get("/api/bundle/stream", (req, res) => {
  const { runId } = req.query;
  if (!runId || !getRun(runId)) {
    res.status(404).end();
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (entry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  };

  attach(runId, send);

  req.on("close", () => unsubscribe(runId, send));
});

app.get("/api/bundle/:runId/file", (req, res) => {
  const run = getRun(req.params.runId);
  if (!run || !run.results?.bundleFileName) return res.status(404).end();
  const filePath = path.join(runDirFor(run.id), run.results.bundleFileName);
  res.download(filePath, run.results.bundleFileName);
});

if (process.env.SERVE_STATIC) {
  const distDir = path.join(__dirname, "..", "web", "dist");
  app.use(express.static(distDir));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(distDir, "index.html")));
}

const PORT = process.env.PORT || 8799;
app.listen(PORT, "127.0.0.1", () => {
  console.log(`Corelight Bundle Builder server on http://127.0.0.1:${PORT}`);
});
