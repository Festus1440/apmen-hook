import { getErrorLogs, getErrorLogById } from "./_errorLog.js";

/**
 * Error log viewer — serves a browsable HTML UI.
 *
 * GET /api/logs            — list page with all error logs
 * GET /api/logs?id=abc     — detail page for a single log entry
 * GET /api/logs?id=abc&raw=1 — renders the raw HTML directly
 * GET /api/logs?json=1     — JSON API (list)
 * GET /api/logs?id=abc&json=1 — JSON API (single entry)
 */
export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id, raw, json } = req.query;

  // --- JSON API mode ---
  if (json === "1") {
    if (id) {
      const entry = await getErrorLogById(id);
      if (!entry) return res.status(404).json({ error: `Log "${id}" not found` });
      return res.status(200).json({
        id: entry._id.toString(),
        type: entry.type || "error",
        jobAddress: entry.jobAddress,
        timestamp: entry.timestamp,
        url: entry.url,
        pageTitle: entry.pageTitle,
        reason: entry.reason,
        bodyPreview: entry.bodyPreview,
        rawHtml: entry.rawHtml,
      });
    }
    const logs = (await getErrorLogs()).map(({ _id, rawHtml, ...rest }) => ({
      id: _id.toString(),
      type: rest.type || "error",
      jobAddress: rest.jobAddress,
      ...rest,
      htmlLength: rawHtml?.length || 0,
    }));
    return res.status(200).json({ count: logs.length, logs });
  }

  // --- Single entry: raw HTML render ---
  if (id && raw === "1") {
    const entry = await getErrorLogById(id);
    if (!entry) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(404).send("<h1>Log entry not found</h1>");
    }
    if (!entry.rawHtml) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(`<p>No raw HTML for this log (success entries do not store page HTML).</p><p><a href="/api/logs?id=${id}">Back to log</a></p>`);
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(entry.rawHtml);
  }

  // --- Single entry: detail page ---
  if (id) {
    const entry = await getErrorLogById(id);
    if (!entry) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(404).send(page("Log Not Found", `<p>No log entry with id <code>${id}</code></p><a href="/api/logs">&larr; Back to list</a>`));
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(detailPage(entry));
  }

  // --- List page ---
  const logs = await getErrorLogs();
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(listPage(logs));
}

// --------------- HTML Templates ---------------

function page(title, body) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — apmen-hook</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0; padding: 24px;
      background: #0f1117; color: #e1e4e8;
      line-height: 1.6;
    }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    h1 { font-size: 1.5rem; margin: 0 0 24px; color: #fff; }
    .badge {
      display: inline-block; padding: 2px 8px; border-radius: 12px;
      font-size: 0.75rem; font-weight: 600;
    }
    .badge-error { background: #da3633; color: #fff; }
    .badge-success { background: #238636; color: #fff; }
    .badge-count { background: #30363d; color: #8b949e; }
    .card {
      background: #161b22; border: 1px solid #30363d; border-radius: 8px;
      padding: 16px; margin-bottom: 12px;
      transition: border-color 0.15s;
    }
    .card:hover { border-color: #58a6ff; }
    .card-title { font-weight: 600; color: #fff; margin-bottom: 4px; }
    .card-meta { font-size: 0.85rem; color: #8b949e; }
    .card-meta span { margin-right: 16px; }
    .empty {
      text-align: center; padding: 48px; color: #8b949e;
      background: #161b22; border-radius: 8px; border: 1px solid #30363d;
    }
    .detail-header { margin-bottom: 20px; }
    .detail-row { margin-bottom: 12px; }
    .detail-label { font-size: 0.8rem; text-transform: uppercase; color: #8b949e; margin-bottom: 2px; }
    .detail-value { color: #e1e4e8; word-break: break-all; }
    .btn {
      display: inline-block; padding: 8px 16px; border-radius: 6px;
      font-size: 0.85rem; font-weight: 600; cursor: pointer;
      border: 1px solid #30363d; background: #21262d; color: #c9d1d9;
      text-decoration: none; margin-right: 8px;
    }
    .btn:hover { background: #30363d; text-decoration: none; }
    .btn-primary { background: #1f6feb; border-color: #1f6feb; color: #fff; }
    .btn-primary:hover { background: #388bfd; }
    iframe {
      width: 100%; height: 600px; border: 1px solid #30363d;
      border-radius: 8px; background: #fff; margin-top: 12px;
    }
    .top-bar {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 24px; flex-wrap: wrap; gap: 12px;
    }
  </style>
</head>
<body>${body}</body>
</html>`;
}

function listPage(logs) {
  if (logs.length === 0) {
    return page("Job Logs", `
      <div class="top-bar">
        <h1>Job Logs</h1>
        <span class="badge badge-count">0 entries</span>
      </div>
      <div class="empty">
        <p>No job logs yet.</p>
        <p>Successes and failures (with job address) are logged when the webhook processes job-offer emails.</p>
      </div>
    `);
  }

  const cards = logs.map((entry) => {
    const id = entry._id.toString();
    const type = entry.type || "error";
    const time = new Date(entry.timestamp).toLocaleString("en-US", {
      dateStyle: "medium", timeStyle: "short",
    });
    const htmlLen = entry.rawHtml?.length || 0;
    const title = type === "success" ? "Job accepted" : (entry.reason || "Unknown error");
    const badgeClass = type === "success" ? "badge-success" : "badge-error";
    return `
      <a href="/api/logs?id=${id}" style="text-decoration:none;color:inherit;">
        <div class="card">
          <div class="card-title"><span class="badge ${badgeClass}">${type === "success" ? "Success" : "Error"}</span> ${esc(title)}</div>
          <div class="card-meta">
            <span>${time}</span>
            ${entry.jobAddress ? `<span>${esc(truncate(entry.jobAddress, 50))}</span>` : ""}
            <span>${esc(entry.pageTitle || "No title")}</span>
            ${htmlLen ? `<span>${(htmlLen / 1024).toFixed(1)} KB</span>` : ""}
          </div>
          <div class="card-meta" style="margin-top:4px;">
            <span>${esc(truncate(entry.url || "", 80))}</span>
          </div>
        </div>
      </a>`;
  }).join("");

  return page("Job Logs", `
    <div class="top-bar">
      <h1>Job Logs</h1>
      <span class="badge badge-count">${logs.length} ${logs.length === 1 ? "entry" : "entries"}</span>
    </div>
    ${cards}
  `);
}

function detailPage(entry) {
  const id = entry._id.toString();
  const type = entry.type || "error";
  const time = new Date(entry.timestamp).toLocaleString("en-US", {
    dateStyle: "full", timeStyle: "medium",
  });
  const htmlLen = entry.rawHtml?.length || 0;
  const title = type === "success" ? "Job accepted" : (entry.reason || "Unknown error");
  const badgeClass = type === "success" ? "badge-success" : "badge-error";

  return page(`Log ${id}`, `
    <div class="detail-header">
      <a href="/api/logs">&larr; Back to list</a>
    </div>
    <h1>
      <span class="badge ${badgeClass}">${type === "success" ? "Success" : "Error"}</span>
      ${esc(title)}
    </h1>

    <div class="detail-row">
      <div class="detail-label">Timestamp</div>
      <div class="detail-value">${time}</div>
    </div>
    ${entry.jobAddress ? `
    <div class="detail-row">
      <div class="detail-label">Job Address</div>
      <div class="detail-value">${esc(entry.jobAddress)}</div>
    </div>
    ` : ""}
    <div class="detail-row">
      <div class="detail-label">Page Title</div>
      <div class="detail-value">${esc(entry.pageTitle || "(none)")}</div>
    </div>
    <div class="detail-row">
      <div class="detail-label">URL</div>
      <div class="detail-value"><a href="${esc(entry.url || "#")}" target="_blank" rel="noopener">${esc(entry.url || "(none)")}</a></div>
    </div>
    ${entry.bodyPreview ? `
    <div class="detail-row">
      <div class="detail-label">Body Preview</div>
      <div class="detail-value">${esc(entry.bodyPreview.slice(0, 500))}</div>
    </div>
    ` : ""}
    ${htmlLen ? `
    <div class="detail-row">
      <div class="detail-label">Raw HTML Size</div>
      <div class="detail-value">${(htmlLen / 1024).toFixed(1)} KB (${htmlLen.toLocaleString()} chars)</div>
    </div>
    ` : ""}

    <div style="margin-top:20px;">
      ${htmlLen ? `<a class="btn btn-primary" href="/api/logs?id=${id}&raw=1" target="_blank">Open Raw HTML</a>` : ""}
      <a class="btn" href="/api/logs?id=${id}&json=1" target="_blank">View JSON</a>
    </div>
    ${htmlLen ? `
    <div class="detail-row" style="margin-top:20px;">
      <div class="detail-label">HTML Preview</div>
      <iframe src="/api/logs?id=${id}&raw=1" sandbox="allow-same-origin"></iframe>
    </div>
    ` : ""}
  `);
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + "..." : str;
}
