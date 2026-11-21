import React from "react";

export default function Results({ runId, results }) {
  if (!results) return null;
  const downloadUrl = `/api/bundle/${runId}/file`;

  return (
    <div className="results">
      <h3>Bundle built</h3>
      <p>
        <strong>{results.bundleFileName}</strong> ({(results.size / 1024).toFixed(1)} KB)
      </p>
      <a className="download-link" href={downloadUrl} download>
        Download bundle
      </a>

      {results.fleet && (
        <div className="fleet-result">
          <p>Uploaded to Fleet — bundle id {results.fleet.bundleId}</p>
          {results.fleet.policyAssigned ? (
            <p>Assigned to policy "{results.fleet.policyName}"</p>
          ) : (
            <p>Uploaded, not assigned to a policy.</p>
          )}
        </div>
      )}
    </div>
  );
}
