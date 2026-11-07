import fs from "node:fs";
import { Agent } from "undici";

// Minimal Fleet Manager REST client for uploading a bundle and (optionally)
// assigning it to a sensor policy. Endpoints and flow reverse-engineered from
// corelight-update's pushContent/fleet package:
//   POST /fleet/v1/login                -> {token}
//   PUT  /fleet/v1/sensor/bundle         -> multipart upload -> {id, errors}
//   GET  /fleet/v1/sensor/policy/list    -> [{id, name, ...}]
//   GET  /fleet/v1/sensor/policy/{id}    -> {name, description, "packages.enabled"}
//   PUT  /fleet/v1/sensor/policy/{id}    -> assign "bundle.id"

function dispatcherFor(ignoreTls) {
  return ignoreTls ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;
}

async function fleetFetch(base, pathName, opts, ignoreTls) {
  const dispatcher = dispatcherFor(ignoreTls);
  const res = await fetch(`https://${base}${pathName}`, { ...opts, dispatcher });
  return res;
}

export async function login(host, username, password, ignoreTls) {
  const res = await fleetFetch(
    host,
    "/fleet/v1/login",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    },
    ignoreTls
  );
  if (res.status !== 200) {
    throw new Error(`Fleet login failed, status ${res.status}: ${await res.text()}`);
  }
  const body = await res.json();
  if (!body.token) throw new Error("Fleet login response had no token");
  return body.token;
}

export async function uploadBundle(host, token, name, description, bundlePath, ignoreTls, emit) {
  const fileBuf = fs.readFileSync(bundlePath);
  const form = new FormData();
  form.set("name", name);
  form.set("description", description || "Created by Corelight Bundle Builder");
  form.set("file", new Blob([fileBuf]), name.endsWith(".bundle") ? name : `${name}.bundle`);

  emit?.(`uploading bundle to https://${host} ...`);
  const res = await fleetFetch(
    host,
    "/fleet/v1/sensor/bundle",
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
    ignoreTls
  );
  const body = await res.json().catch(() => ({}));
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Fleet bundle upload failed, status ${res.status}: ${JSON.stringify(body)}`);
  }
  if (body.errors && body.errors.length) {
    throw new Error(`Fleet bundle upload reported errors: ${JSON.stringify(body.errors)}`);
  }
  emit?.(`uploaded, bundle id ${body.id}`);
  return body.id;
}

export async function listPolicies(host, token, ignoreTls) {
  const res = await fleetFetch(
    host,
    "/fleet/v1/sensor/policy/list",
    { headers: { Authorization: `Bearer ${token}` } },
    ignoreTls
  );
  if (res.status !== 200) {
    throw new Error(`Fetching Fleet policy list failed, status ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export async function getPolicy(host, token, policyId, ignoreTls) {
  const res = await fleetFetch(
    host,
    `/fleet/v1/sensor/policy/${policyId}`,
    { headers: { Authorization: `Bearer ${token}` } },
    ignoreTls
  );
  if (res.status !== 200) {
    throw new Error(`Fetching Fleet policy ${policyId} failed, status ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export async function assignBundleToPolicy(host, token, policyId, policyDetails, bundleId, ignoreTls) {
  const newConfig = {
    "bundle.id": bundleId,
    name: policyDetails.name,
    description: policyDetails.description,
    "packages.enabled": policyDetails["packages.enabled"],
  };
  const res = await fleetFetch(
    host,
    `/fleet/v1/sensor/policy/${policyId}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(newConfig),
    },
    ignoreTls
  );
  if (res.status !== 200) {
    throw new Error(`Assigning bundle to policy ${policyId} failed, status ${res.status}: ${await res.text()}`);
  }
}

// uploadToFleet orchestrates: login -> upload -> (optional) resolve+assign policy.
export async function uploadToFleet({ host, username, password, ignoreTls, policyName }, bundlePath, name, description, emit) {
  const token = await login(host, username, password, ignoreTls);
  emit?.("Fleet login ok");
  const bundleId = await uploadBundle(host, token, name, description, bundlePath, ignoreTls, emit);

  if (!policyName || !policyName.trim()) {
    return { bundleId, policyAssigned: false };
  }

  const policies = await listPolicies(host, token, ignoreTls);
  const match = policies.find((p) => (p.name || "").toLowerCase() === policyName.trim().toLowerCase());
  if (!match) {
    throw new Error(`No sensor policy named "${policyName}" was found on this Fleet Manager`);
  }
  const details = await getPolicy(host, token, match.id, ignoreTls);
  await assignBundleToPolicy(host, token, match.id, details, bundleId, ignoreTls);
  emit?.(`bundle assigned to policy "${policyName}"`);
  return { bundleId, policyAssigned: true, policyName };
}
