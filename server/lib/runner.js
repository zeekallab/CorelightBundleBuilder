import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildBundle, extractBundle } from "./bundler.js";
import { uploadToFleet } from "./fleet.js";

const RUNS_DIR = process.env.CBB_RUNS_DIR || path.join(process.cwd(), "runs");
fs.mkdirSync(RUNS_DIR, { recursive: true });

const runs = new Map(); // runId -> { log: [], subscribers: Set, status, results, error }
const seeds = new Map(); // seedId -> { dir, packages }

function newId() {
  return crypto.randomBytes(8).toString("hex");
}

function sanitizeName(name) {
  const base = (name || "custom").trim().replace(/[^a-zA-Z0-9._-]+/g, "-");
  return base || "custom";
}

export function runDirFor(runId) {
  return path.join(RUNS_DIR, runId);
}

export async function extractSeed(uploadedFilePath) {
  const seedId = newId();
  const seedDir = path.join(RUNS_DIR, "seed-" + seedId);
  const packages = await extractBundle(uploadedFilePath, seedDir);
  seeds.set(seedId, { dir: seedDir, packages });
  return { seedId, packages: packages.map(({ url, ref }) => ({ url, ref })) };
}

export function createRun(form) {
  const runId = newId();
  const runDir = runDirFor(runId);
  fs.mkdirSync(runDir, { recursive: true });

  const run = {
    id: runId,
    runDir,
    form,
    log: [],
    subscribers: new Set(),
    status: "pending",
    results: null,
    error: null,
  };
  runs.set(runId, run);
  return run;
}

function emitLine(run, line) {
  const entry = { type: "log", line, t: Date.now() };
  run.log.push(entry);
  for (const send of run.subscribers) send(entry);
}

function emitEvent(run, type, data) {
  const entry = { type, ...data, t: Date.now() };
  run.log.push(entry);
  for (const send of run.subscribers) send(entry);
}

export function attach(runId, send) {
  const run = runs.get(runId);
  if (!run) return false;
  for (const entry of run.log) send(entry);
  run.subscribers.add(send);
  if (run.status === "pending") execute(run);
  return true;
}

export function unsubscribe(runId, send) {
  const run = runs.get(runId);
  if (run) run.subscribers.delete(send);
}

async function execute(run) {
  run.status = "running";
  try {
    const name = sanitizeName(run.form.name);
    // Merge every loaded bundle's packages into one reuse lookup - buildBundle
    // keys them by {url,ref}, so packages from different source bundles just
    // coexist in the same map; a url+ref present in more than one loaded
    // bundle keeps whichever seed listed it first.
    const seedIds = run.form.seedIds || (run.form.seedId ? [run.form.seedId] : []);
    const seed = seedIds.flatMap((id) => seeds.get(id)?.packages || []);

    const { bundlePath, bundleFileName, size } = await buildBundle(
      {
        runDir: run.runDir,
        name,
        packages: run.form.packages,
        seed,
      },
      (line) => emitLine(run, line)
    );

    const results = { bundleFileName, size };

    if (run.form.fleet) {
      emitLine(run, "starting Fleet upload...");
      const fleetResult = await uploadToFleet(
        run.form.fleet,
        bundlePath,
        name,
        run.form.description,
        (line) => emitLine(run, line)
      );
      results.fleet = fleetResult;
    }

    run.status = "complete";
    run.results = results;
    emitEvent(run, "results", { results });
    emitEvent(run, "end", { status: "complete" });
  } catch (err) {
    run.status = "error";
    run.error = err.message;
    emitLine(run, `ERROR: ${err.message}`);
    emitEvent(run, "end", { status: "error", error: err.message });
  }
}

export function getRun(runId) {
  return runs.get(runId);
}

export function getSeedPackages(seedId) {
  return seeds.get(seedId)?.packages || null;
}
