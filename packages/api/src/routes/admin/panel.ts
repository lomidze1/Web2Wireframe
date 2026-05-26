import { Router, type Request, type Response } from "express";

const router = Router();

/**
 * GET /api/admin/panel/.html
 *
 * Server-rendered single-page admin UI for licence management. The page is
 * a pure fetch shell — it contains no secrets, talks only to the existing
 * admin endpoints, and the ADMIN_TOKEN is supplied client-side via the URL
 * fragment (`#token=…`). Fragments are not sent to the server, so the
 * token never lands in access logs or proxy buffers.
 *
 * Capabilities:
 *   - Search by email / figmaUserId / recent activity
 *   - Inspect a user's licence + audit trail
 *   - Grant Pro (Monthly +30d, Yearly +365d, custom extension)
 *   - Cancel subscription (Pro until cycleEndsAt → auto-Free)
 *   - Revoke immediately (downgrade to Free now)
 *
 * Every mutation goes through the existing /api/admin/license/override
 * endpoint, which writes a non-repudiation audit row with the supplied
 * reason before mutating state.
 *
 * Usage:
 *   https://api.web2wireframe.design/api/admin/panel/.html#token=<ADMIN_TOKEN>
 */
router.get("/.html", (_req: Request, res: Response) => {
  res.type("html").send(PANEL_HTML);
});

export default router;

// ----------------------------------------------------------------------------
// HTML payload
// ----------------------------------------------------------------------------

const PANEL_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Web2Wireframe — Admin Panel</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 1080px; margin: 30px auto; padding: 0 20px; background: #f7f8fa; color: #0c0d12; }
  h1 { margin: 0 0 4px; }
  .sub { color: #5a6072; font-size: 0.9rem; margin-bottom: 24px; }
  .panel { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 18px 20px; margin-bottom: 18px; }
  .panel h2 { margin: 0 0 14px; font-size: 1.05rem; }
  label { display: block; font-size: 0.78rem; color: #5a6072; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.04em; }
  input[type="text"], input[type="number"], input[type="email"] { width: 100%; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 0.95rem; }
  .row { display: grid; grid-template-columns: 1fr auto; gap: 10px; margin-bottom: 12px; align-items: end; }
  .row-3 { display: grid; grid-template-columns: 1fr 90px auto; gap: 10px; margin-bottom: 12px; align-items: end; }
  button { padding: 8px 14px; border: 1px solid #0c0d12; background: #0c0d12; color: #fff; border-radius: 6px; cursor: pointer; font-size: 0.9rem; }
  button.secondary { background: #fff; color: #0c0d12; }
  button.danger { background: #b91c1c; border-color: #b91c1c; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .filter-row { display: flex; flex-wrap: wrap; gap: 8px; }
  .pager { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #eef0f3; font-size: 0.85rem; color: #5a6072; }
  .pager .pages { font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #eef0f3; }
  th { font-weight: 600; color: #5a6072; font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; }
  tr.selectable { cursor: pointer; }
  tr.selectable:hover { background: #f0f3f9; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 0.72rem; font-weight: 600; }
  .pill-pro { background: #ecfdf5; color: #047857; }
  .pill-free { background: #f3f4f6; color: #5a6072; }
  .pill-active { background: #ecfeff; color: #0e7490; }
  .pill-canceled { background: #fef2f2; color: #b91c1c; }
  .pill-expired { background: #fef3c7; color: #92400e; }
  .meta-grid { display: grid; grid-template-columns: 140px 1fr; gap: 4px 14px; font-size: 0.9rem; margin-bottom: 14px; }
  .meta-grid .k { color: #5a6072; }
  .meta-grid .v { font-weight: 500; word-break: break-all; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #eef0f3; }
  .audit-row { padding: 8px 10px; border-bottom: 1px solid #eef0f3; font-size: 0.85rem; }
  .audit-row code { background: #f0f3f9; padding: 1px 6px; border-radius: 4px; font-size: 0.8em; }
  .toast { position: fixed; bottom: 24px; right: 24px; background: #0c0d12; color: #fff; padding: 12px 16px; border-radius: 8px; box-shadow: 0 8px 20px rgba(0,0,0,0.15); font-size: 0.9rem; z-index: 1000; max-width: 400px; }
  .toast.error { background: #b91c1c; }
  .toast.success { background: #047857; }
  .empty { color: #5a6072; font-style: italic; padding: 14px 0; text-align: center; }
  .token-warn { background: #fef3c7; border: 1px solid #fbbf24; color: #78350f; padding: 10px 14px; border-radius: 6px; font-size: 0.88rem; margin-bottom: 18px; }
</style>
</head>
<body>
<h1>Web2Wireframe — Admin Panel</h1>
<p class="sub">License management. Every action writes to the audit log.</p>
<div id="token-warn" class="token-warn" style="display:none">
  ⚠ No admin token found. Append <code>#token=&lt;ADMIN_TOKEN&gt;</code> to the URL.
</div>

<div class="panel">
  <h2>🔍 Search</h2>
  <div class="row">
    <div>
      <label for="emailInput">By email</label>
      <input id="emailInput" type="email" placeholder="user@example.com" />
    </div>
    <button id="searchEmailBtn">Search</button>
  </div>
  <div class="row">
    <div>
      <label for="fuidInput">By Figma User ID</label>
      <input id="fuidInput" type="text" placeholder="123456789012345" />
    </div>
    <button id="searchFuidBtn">Search</button>
  </div>
  <div class="filter-row">
    <button id="recentBtn" class="secondary">Show recent 20 licenses</button>
    <button id="monthlyBtn" class="secondary">Show monthly licenses</button>
    <button id="yearlyBtn" class="secondary">Show yearly licenses</button>
    <button id="cancelledBtn" class="secondary">Last 20 cancelled users</button>
  </div>
</div>

<div class="panel" id="resultsPanel" style="display:none">
  <h2>Results</h2>
  <div id="resultsBody"></div>
  <div id="pager" class="pager" style="display:none">
    <button id="prevPageBtn" class="secondary">‹ Prev</button>
    <span class="pages" id="pagerLabel">Page 1</span>
    <button id="nextPageBtn" class="secondary">Next ›</button>
  </div>
</div>

<div class="panel" id="detailPanel" style="display:none">
  <h2>Selected User</h2>
  <div id="detailBody"></div>

  <div class="actions">
    <div style="flex:1 1 100%; margin-bottom:8px">
      <label for="reasonInput">Reason (required — recorded in audit log)</label>
      <input id="reasonInput" type="text" placeholder="e.g. comp grant, refund processed manually, support case #123" />
    </div>
    <button id="grantMonthlyBtn">Grant Pro Monthly (+30d)</button>
    <button id="grantYearlyBtn">Grant Pro Yearly (+365d)</button>
    <div class="row-3" style="flex:1 1 100%; margin-top:6px">
      <div>
        <label for="extendDaysInput">Extend by N days (from current cycle end)</label>
        <input id="extendDaysInput" type="number" min="1" max="3650" placeholder="30" />
      </div>
      <input id="extendDaysInput2" type="hidden" />
      <button id="extendBtn" class="secondary">Apply</button>
    </div>
    <button id="cancelBtn" class="secondary">Cancel subscription</button>
    <button id="revokeBtn" class="danger">Revoke (immediate downgrade)</button>
  </div>
</div>

<div class="panel" id="auditPanel" style="display:none">
  <h2>Audit Log (last 20 entries)</h2>
  <div id="auditBody"></div>
</div>

<script>
// HTML escape — defense in depth. Everything from JSON responses passes
// through this before innerHTML interpolation.
function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Token comes from URL fragment (#token=...). Fragments are not transmitted
// in HTTP requests, so this never reaches the server logs.
function token() {
  var m = location.hash.match(/token=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

var DAY_MS = 24 * 60 * 60 * 1000;
var selectedUser = null; // figmaUserId currently loaded into detail panel

function checkToken() {
  if (!token()) {
    document.getElementById("token-warn").style.display = "block";
    return false;
  }
  return true;
}

function authHeaders() {
  var t = token();
  return t ? { "Authorization": "Bearer " + t, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

function toast(message, kind) {
  var el = document.createElement("div");
  el.className = "toast " + (kind || "");
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, 4500);
}

async function api(path, options) {
  options = options || {};
  options.headers = Object.assign({}, authHeaders(), options.headers || {});
  var res;
  try {
    res = await fetch(path, options);
  } catch (e) {
    toast("Network error: " + e.message, "error");
    throw e;
  }
  if (res.status === 401) {
    toast("Unauthorized — bad or missing ADMIN_TOKEN", "error");
    throw new Error("unauthorized");
  }
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    var body = await res.text();
    toast("HTTP " + res.status + ": " + body.slice(0, 200), "error");
    throw new Error("http_" + res.status);
  }
  return res.json();
}

function planPill(plan) {
  return '<span class="pill pill-' + esc(plan) + '">' + esc(plan) + '</span>';
}

function statusPill(status) {
  return '<span class="pill pill-' + esc(status) + '">' + esc(status) + '</span>';
}

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch (e) { return iso; }
}

function renderLicenseRows(licenses) {
  if (!licenses || licenses.length === 0) {
    return '<div class="empty">No licenses found.</div>';
  }
  var rows = licenses.map(function (l) {
    return '<tr class="selectable" data-fuid="' + esc(l.figmaUserId) + '">' +
      '<td>' + esc(l.figmaUserId) + '</td>' +
      '<td>' + esc(l.email || "—") + '</td>' +
      '<td>' + planPill(l.plan) + '</td>' +
      '<td>' + statusPill(l.status) + '</td>' +
      '<td>' + esc(fmtDate(l.cycleEndsAt)) + '</td>' +
      '<td>' + esc(l.usage && l.usage.imports != null ? l.usage.imports : "—") + '</td>' +
    '</tr>';
  }).join("");
  return '<table>' +
    '<thead><tr><th>Figma User ID</th><th>Email</th><th>Plan</th><th>Status</th><th>Cycle Ends</th><th>Imports</th></tr></thead>' +
    '<tbody>' + rows + '</tbody>' +
  '</table>';
}

function renderDetail(license) {
  var sub = license.subscription || {};
  return '<div class="meta-grid">' +
    '<div class="k">Figma User ID</div><div class="v">' + esc(license.figmaUserId) + '</div>' +
    '<div class="k">Email</div><div class="v">' + esc(license.email || "—") + '</div>' +
    '<div class="k">Plan</div><div class="v">' + planPill(license.plan) + '</div>' +
    '<div class="k">Status</div><div class="v">' + statusPill(license.status) + '</div>' +
    '<div class="k">Cycle started</div><div class="v">' + esc(fmtDate(license.cycleStartedAt)) + '</div>' +
    '<div class="k">Cycle ends</div><div class="v">' + esc(fmtDate(license.cycleEndsAt)) + '</div>' +
    '<div class="k">Imports used</div><div class="v">' + esc(license.usage && license.usage.imports != null ? license.usage.imports : "—") + '</div>' +
    '<div class="k">Flitt order</div><div class="v">' + esc(sub.flittOrderId || "—") + '</div>' +
    '<div class="k">Auto renew</div><div class="v">' + esc(sub.autoRenew == null ? "—" : String(sub.autoRenew)) + '</div>' +
    '<div class="k">Last duration</div><div class="v">' + esc(sub.lastDuration || "—") + '</div>' +
    '<div class="k">Created</div><div class="v">' + esc(fmtDate(license.createdAt)) + '</div>' +
    '<div class="k">Updated</div><div class="v">' + esc(fmtDate(license.updatedAt)) + '</div>' +
  '</div>';
}

function renderAudit(entries) {
  if (!entries || entries.length === 0) {
    return '<div class="empty">No audit entries.</div>';
  }
  return entries.map(function (e) {
    var changes = e.changes && Object.keys(e.changes).length ? JSON.stringify(e.changes) : "";
    var ctx = e.context && Object.keys(e.context).length ? JSON.stringify(e.context) : "";
    return '<div class="audit-row">' +
      '<strong>' + esc(e.action) + '</strong> · ' + esc(fmtDate(e.at)) +
      (changes ? ' · <code>' + esc(changes) + '</code>' : '') +
      (ctx ? ' · ' + esc(ctx) : '') +
    '</div>';
  }).join("");
}

// ----- Search handlers -----

document.getElementById("searchEmailBtn").addEventListener("click", async function () {
  var email = document.getElementById("emailInput").value.trim();
  if (!email) { toast("Enter an email first", "error"); return; }
  var data = await api("/api/admin/license/lookup-by-email?email=" + encodeURIComponent(email));
  document.getElementById("resultsPanel").style.display = "block";
  document.getElementById("resultsBody").innerHTML = renderLicenseRows(data && data.licenses);
  attachRowHandlers();
});

document.getElementById("searchFuidBtn").addEventListener("click", async function () {
  var fuid = document.getElementById("fuidInput").value.trim();
  if (!fuid) { toast("Enter a Figma User ID first", "error"); return; }
  var data = await api("/api/admin/license/" + encodeURIComponent(fuid));
  if (!data) {
    toast("No license found for " + fuid, "error");
    document.getElementById("resultsPanel").style.display = "none";
    return;
  }
  document.getElementById("resultsPanel").style.display = "block";
  document.getElementById("resultsBody").innerHTML = renderLicenseRows([data]);
  attachRowHandlers();
  await loadDetail(fuid);
});

// Renders the array of license rows into the Results panel. Centralizes
// the .innerHTML write so every list view (recent, monthly, yearly,
// cancelled) escapes through the same renderer (renderLicenseRows -> esc).
function paintResults(licenses) {
  document.getElementById("resultsPanel").style.display = "block";
  var body = document.getElementById("resultsBody");
  body.innerHTML = renderLicenseRows(licenses);
  attachRowHandlers();
}

document.getElementById("recentBtn").addEventListener("click", async function () {
  var data = await api("/api/admin/license/recent?limit=20");
  paintResults(data && data.licenses);
  document.getElementById("pager").style.display = "none";
});

// State for the paginated filtered views (monthly / yearly). Held at module
// scope so the Prev / Next buttons know which filter to re-query.
var currentFilter = null; // { duration?: "monthly"|"yearly" } or null
var currentPage = 1;
var PAGE_SIZE = 20;

async function loadFilteredPage(filter, page) {
  currentFilter = filter;
  currentPage = page;
  var qs = "limit=" + PAGE_SIZE + "&page=" + page;
  if (filter.duration) qs += "&duration=" + encodeURIComponent(filter.duration);
  var data = await api("/api/admin/license/recent?" + qs);
  if (!data) return;
  paintResults(data.licenses);
  var total = data.total || 0;
  var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  document.getElementById("pager").style.display = "flex";
  document.getElementById("pagerLabel").textContent =
    "Page " + page + " of " + totalPages + " (" + total + " total)";
  document.getElementById("prevPageBtn").disabled = page <= 1;
  document.getElementById("nextPageBtn").disabled = page >= totalPages;
}

document.getElementById("monthlyBtn").addEventListener("click", function () {
  loadFilteredPage({ duration: "monthly" }, 1);
});

document.getElementById("yearlyBtn").addEventListener("click", function () {
  loadFilteredPage({ duration: "yearly" }, 1);
});

document.getElementById("prevPageBtn").addEventListener("click", function () {
  if (!currentFilter || currentPage <= 1) return;
  loadFilteredPage(currentFilter, currentPage - 1);
});

document.getElementById("nextPageBtn").addEventListener("click", function () {
  if (!currentFilter) return;
  loadFilteredPage(currentFilter, currentPage + 1);
});

document.getElementById("cancelledBtn").addEventListener("click", async function () {
  // One-shot view, no pagination — just the 20 most-recently-canceled rows
  // (sort=updatedAt desc, catches both Flitt and admin cancels).
  var data = await api("/api/admin/license/recent?limit=20&status=canceled");
  paintResults(data && data.licenses);
  document.getElementById("pager").style.display = "none";
});

function attachRowHandlers() {
  var rows = document.querySelectorAll("#resultsBody tr.selectable");
  for (var i = 0; i < rows.length; i++) {
    rows[i].addEventListener("click", function () {
      var fuid = this.getAttribute("data-fuid");
      loadDetail(fuid);
    });
  }
}

async function loadDetail(figmaUserId) {
  var license = await api("/api/admin/license/" + encodeURIComponent(figmaUserId));
  if (!license) {
    toast("License not found", "error");
    return;
  }
  selectedUser = figmaUserId;
  document.getElementById("detailPanel").style.display = "block";
  document.getElementById("detailBody").innerHTML = renderDetail(license);

  var audit = await api("/api/admin/license/" + encodeURIComponent(figmaUserId) + "/audit?limit=20");
  document.getElementById("auditPanel").style.display = "block";
  document.getElementById("auditBody").innerHTML = renderAudit(audit && audit.entries);
}

// ----- Action handlers -----

function requireSelection() {
  if (!selectedUser) {
    toast("Select a user first", "error");
    return false;
  }
  return true;
}

function requireReason() {
  var reason = document.getElementById("reasonInput").value.trim();
  if (!reason) {
    toast("Reason is required", "error");
    document.getElementById("reasonInput").focus();
    return null;
  }
  return reason;
}

async function override(body) {
  var data = await api("/api/admin/license/override", {
    method: "POST",
    body: JSON.stringify(body),
  });
  toast("Updated. " + esc(data.figmaUserId) + " is now " + esc(data.plan) + "/" + esc(data.status), "success");
  await loadDetail(selectedUser);
}

document.getElementById("grantMonthlyBtn").addEventListener("click", async function () {
  if (!requireSelection()) return;
  var reason = requireReason(); if (!reason) return;
  var ends = new Date(Date.now() + 30 * DAY_MS).toISOString();
  await override({ figmaUserId: selectedUser, plan: "pro", status: "active", cycleEndsAt: ends, reason: reason });
});

document.getElementById("grantYearlyBtn").addEventListener("click", async function () {
  if (!requireSelection()) return;
  var reason = requireReason(); if (!reason) return;
  var ends = new Date(Date.now() + 365 * DAY_MS).toISOString();
  await override({ figmaUserId: selectedUser, plan: "pro", status: "active", cycleEndsAt: ends, reason: reason });
});

document.getElementById("extendBtn").addEventListener("click", async function () {
  if (!requireSelection()) return;
  var reason = requireReason(); if (!reason) return;
  var n = parseInt(document.getElementById("extendDaysInput").value, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 3650) { toast("Enter a positive day count (1-3650)", "error"); return; }
  // Read current cycleEndsAt from the detail panel via a fresh fetch so we
  // stack on top of the live value, not whatever the page first loaded.
  var license = await api("/api/admin/license/" + encodeURIComponent(selectedUser));
  if (!license) { toast("Could not re-read license", "error"); return; }
  var base = license.cycleEndsAt ? new Date(license.cycleEndsAt).getTime() : Date.now();
  // If the cycle is already in the past, extend from "now" so the user
  // actually gets N days from today, not N days from a stale expiry.
  var anchor = Math.max(base, Date.now());
  var ends = new Date(anchor + n * DAY_MS).toISOString();
  await override({ figmaUserId: selectedUser, cycleEndsAt: ends, reason: reason });
});

document.getElementById("cancelBtn").addEventListener("click", async function () {
  if (!requireSelection()) return;
  var reason = requireReason(); if (!reason) return;
  if (!confirm("Cancel subscription for " + selectedUser + "? Pro access stays until cycleEndsAt, then auto-downgrades to Free.")) return;
  await override({ figmaUserId: selectedUser, status: "canceled", reason: reason });
});

document.getElementById("revokeBtn").addEventListener("click", async function () {
  if (!requireSelection()) return;
  var reason = requireReason(); if (!reason) return;
  if (!confirm("Immediately downgrade " + selectedUser + " to Free? This bypasses cycleEndsAt and revokes Pro NOW.")) return;
  await override({ figmaUserId: selectedUser, plan: "free", status: "active", reason: reason });
});

// ----- Initial state -----
checkToken();
</script>
</body>
</html>`;
