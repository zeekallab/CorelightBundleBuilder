import React from "react";

export default function FleetPanel({ enabled, onToggle, fleet, onChange }) {
  function set(field, value) {
    onChange({ ...fleet, [field]: value });
  }

  return (
    <div className="fleet-panel">
      <label className="checkbox-row">
        <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} />
        Upload to Fleet Manager
      </label>
      {enabled && (
        <div className="fleet-fields">
          <label>
            Fleet IP / FQDN
            <input
              type="text"
              placeholder="fleet.example.com"
              value={fleet.host}
              onChange={(e) => set("host", e.target.value)}
            />
          </label>
          <label>
            Username
            <input type="text" value={fleet.username} onChange={(e) => set("username", e.target.value)} />
          </label>
          <label>
            Password
            <input
              type="password"
              value={fleet.password}
              onChange={(e) => set("password", e.target.value)}
            />
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={fleet.ignoreTls}
              onChange={(e) => set("ignoreTls", e.target.checked)}
            />
            Ignore TLS certificate errors (self-signed Fleet certs)
          </label>
          <label>
            Assign to sensor policy (optional)
            <input
              type="text"
              placeholder="leave blank to just upload the bundle"
              value={fleet.policyName}
              onChange={(e) => set("policyName", e.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
