import { Router, type Request, type Response } from "express";
import { License } from "../../models/License.js";
import { WebhookEvent } from "../../models/WebhookEvent.js";
import { LicenseAudit } from "../../models/LicenseAudit.js";
import { ImportEvent } from "../../models/ImportEvent.js";
import { PLAN_PRICES } from "../../models/License.js";
import { verifyAdminCredential } from "../../middleware/adminAuth.js";

const router = Router();

/**
 * GET /api/admin/stats
 *
 * Single aggregated "how's the business doing?" view, computed live from
 * MongoDB. Intentionally lightweight — no time-series, no per-day buckets;
 * those belong in a real analytics stack (Grafana + Prometheus, which we
 * already feed via /api/metrics).
 *
 * Why not pre-aggregate / cache: at our scale (low thousands of users in
 * year 1), every aggregation here runs in tens of milliseconds against
 * the existing indexes. Caching adds invalidation surface for no real
 * latency win.
 *
 * Admin-gated: same `verifyAdminCredential` as /api/health/flitt and
 * /api/admin/license/*. In dev (no ADMIN_TOKEN), open.
 */
router.get("/", async (req: Request, res: Response) => {
  if (!verifyAdminCredential(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const last7d = new Date(now.getTime() - 7 * day);
    const last30d = new Date(now.getTime() - 30 * day);

    // Run independent aggregates in parallel — saves ~6× sequential
    // latency on a 10-row report.
    const [
      totalUsers,
      proUsers,
      freeUsers,
      canceledUsers,
      newUsers7d,
      newUsers30d,
      activeUsers30d,
      approved30d,
      approved7d,
      declined7d,
      reversed30d,
      proActivationsAudit30d,
      refundsAudit30d,
      userList,
      recentImportEvents,
    ] = await Promise.all([
      License.countDocuments({}),
      License.countDocuments({ plan: "pro" }),
      License.countDocuments({ plan: "free" }),
      License.countDocuments({ status: "canceled" }),
      License.countDocuments({ createdAt: { $gte: last7d } }),
      License.countDocuments({ createdAt: { $gte: last30d } }),
      License.countDocuments({ "usage.periodStartedAt": { $gte: last30d } }),
      WebhookEvent.countDocuments({
        orderStatus: "approved",
        processedAt: { $gte: last30d },
      }),
      WebhookEvent.countDocuments({
        orderStatus: "approved",
        processedAt: { $gte: last7d },
      }),
      WebhookEvent.countDocuments({
        orderStatus: { $in: ["declined", "expired"] },
        processedAt: { $gte: last7d },
      }),
      WebhookEvent.countDocuments({
        orderStatus: "reversed",
        processedAt: { $gte: last30d },
      }),
      LicenseAudit.countDocuments({
        action: { $in: ["subscription_activation", "one_time_purchase"] },
        at: { $gte: last30d },
      }),
      LicenseAudit.countDocuments({
        action: "refund",
        "context.revoked": true,
        at: { $gte: last30d },
      }),
      // Full user roster for the dashboard table. Tiny projection — only the
      // columns the table renders — so even at thousands of rows this stays a
      // cheap index-light read. Sorted newest-first; the client re-sorts.
      License.find(
        {},
        {
          _id: 0,
          figmaUserId: 1,
          email: 1,
          plan: 1,
          status: 1,
          "usage.imports": 1,
          createdAt: 1,
        },
      )
        .sort({ createdAt: -1 })
        .lean(),
      // Recent import attempts across all paths — the "what did people try to
      // import, and what failed?" feed. Newest 50 is plenty for a glance.
      ImportEvent.find(
        {},
        {
          _id: 0,
          figmaUserId: 1,
          sourceUrl: 1,
          title: 1,
          type: 1,
          viewports: 1,
          success: 1,
          errorCode: 1,
          createdAt: 1,
        },
      )
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
    ]);

    // Revenue estimate: approved webhooks × Pro price, minus reversals.
    // Approximate — assumes every approved is at Pro price and every
    // reversal is a full refund of one Pro payment. Cross-check against
    // Flitt's settlement report for the source of truth.
    const grossRevenueCents30d = approved30d * PLAN_PRICES.pro.priceCents;
    const refundedCents30d = reversed30d * PLAN_PRICES.pro.priceCents;
    const netRevenueCents30d = grossRevenueCents30d - refundedCents30d;

    // Conversion rate: of users created in last 30d, how many ever
    // activated Pro? Note: the audit-based count includes ALL activations,
    // not just first-time — close enough for a directional metric.
    const conversionRate30d =
      newUsers30d > 0
        ? Math.round((proActivationsAudit30d / newUsers30d) * 10000) / 100
        : 0;

    // Join each import event to its user's email via the roster we already
    // fetched — avoids a second round-trip / $lookup.
    const emailByUserId = new Map(
      userList.map((u) => [u.figmaUserId, u.email ?? null]),
    );
    const recentImports = recentImportEvents.map((e) => ({
      figmaUserId: e.figmaUserId,
      email: emailByUserId.get(e.figmaUserId) ?? null,
      sourceUrl: e.sourceUrl,
      title: e.title ?? null,
      type: e.type,
      viewports: e.viewports ?? [],
      success: e.success,
      errorCode: e.errorCode ?? null,
      createdAt:
        e.createdAt instanceof Date
          ? e.createdAt.toISOString()
          : (e.createdAt ?? null),
    }));

    res.json({
      generatedAt: now.toISOString(),
      recentImports,
      users: {
        total: totalUsers,
        byPlan: { free: freeUsers, pro: proUsers },
        byStatus: { canceled: canceledUsers },
        new7d: newUsers7d,
        new30d: newUsers30d,
        active30d: activeUsers30d, // imported anything in last 30d
        list: userList.map((u) => ({
          figmaUserId: u.figmaUserId,
          email: u.email ?? null,
          plan: u.plan,
          status: u.status,
          imports: u.usage?.imports ?? 0,
          createdAt:
            u.createdAt instanceof Date
              ? u.createdAt.toISOString()
              : (u.createdAt ?? null),
        })),
      },
      revenue: {
        currency: PLAN_PRICES.pro.currency,
        approved7d,
        approved30d,
        reversed30d,
        gross30dCents: grossRevenueCents30d,
        refunded30dCents: refundedCents30d,
        net30dCents: netRevenueCents30d,
      },
      payments: {
        declined7d,
        reversed30d,
        proActivations30d: proActivationsAudit30d,
        refunds30d: refundsAudit30d,
      },
      conversion: {
        rate30dPercent: conversionRate30d,
        explainer:
          "proActivations30d / new30d × 100. Directional — counts all activations, not just first-time.",
      },
    });
  } catch (err) {
    console.error("[Admin] stats error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /api/admin/stats/imports?figmaUserId=<id>
 *
 * One user's import history — the drill-down behind a clickable row in the
 * dashboard. Newest 100 imports with their full parameters, so the owner can
 * reproduce exactly what a given user did. Admin-gated, same credential as the
 * main stats endpoint.
 */
router.get("/imports", async (req: Request, res: Response) => {
  if (!verifyAdminCredential(req)) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const figmaUserId = String(req.query.figmaUserId || "");
  if (!figmaUserId) {
    res.status(400).json({ error: "Missing figmaUserId" });
    return;
  }
  try {
    const events = await ImportEvent.find(
      { figmaUserId },
      {
        _id: 0,
        sourceUrl: 1,
        title: 1,
        type: 1,
        viewports: 1,
        params: 1,
        success: 1,
        errorCode: 1,
        createdAt: 1,
      },
    )
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.json({
      figmaUserId,
      imports: events.map((e) => ({
        sourceUrl: e.sourceUrl,
        title: e.title ?? null,
        type: e.type,
        viewports: e.viewports ?? [],
        params: e.params ?? null,
        success: e.success,
        errorCode: e.errorCode ?? null,
        createdAt:
          e.createdAt instanceof Date
            ? e.createdAt.toISOString()
            : (e.createdAt ?? null),
      })),
    });
  } catch (err) {
    console.error("[Admin] stats/imports error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * GET /api/admin/stats.html
 *
 * Tiny zero-dependency dashboard for the founder. Fetches /api/admin/stats
 * via a same-origin XHR (carries the admin token from the URL hash) and
 * renders a single-page table. Not a real analytics product — a glance
 * surface for the first 100-1000 users, before a real analytics stack is
 * worth setting up.
 *
 * Usage: open
 *   https://api.web2wireframe.design/api/admin/stats.html#token=<ADMIN_TOKEN>
 * The token sits in the URL fragment (#), which browsers do NOT send to
 * the server in the navigation request — so it never lands in our access
 * logs. JavaScript reads it client-side and uses it for the API call.
 */
router.get("/.html", (_req: Request, res: Response) => {
  res.type("html").send(STATS_HTML);
});

const STATS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Web2Wireframe — admin stats</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 980px; margin: 30px auto; padding: 0 20px; background: #f7f8fa; color: #0c0d12; }
  h1 { margin: 0 0 8px; }
  .sub { color: #5a6072; font-size: 0.9rem; margin-bottom: 24px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 18px; }
  .card-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #5a6072; margin-bottom: 6px; }
  .card-value { font-size: 1.8rem; font-weight: 700; color: #0c0d12; }
  .card-meta { font-size: 0.85rem; color: #5a6072; margin-top: 4px; }
  section { margin-top: 28px; }
  h2 { font-size: 1.05rem; margin: 0 0 12px; color: #0c0d12; }
  .error { background: #fdecea; border: 1px solid #f5b6b0; border-radius: 8px; padding: 12px 16px; color: #842029; }
  .reload { float: right; padding: 6px 12px; border: 1px solid #c5c8ce; background: #fff; border-radius: 6px; cursor: pointer; font-size: 0.85rem; }
  .reload:hover { background: #f0f2f5; }
  code { background: #eef0f4; padding: 1px 5px; border-radius: 3px; font-size: 0.85em; }
  .toolbar { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; align-items: center; }
  .toolbar .group { display: flex; gap: 6px; }
  .toolbar .sep { width: 1px; align-self: stretch; background: #e5e7eb; margin: 2px 4px; }
  .btn { padding: 6px 12px; border: 1px solid #c5c8ce; background: #fff; border-radius: 6px; cursor: pointer; font-size: 0.82rem; color: #0c0d12; }
  .btn:hover { background: #f0f2f5; }
  .btn.active { background: #0c0d12; border-color: #0c0d12; color: #fff; }
  .count { color: #5a6072; font-size: 0.82rem; margin-left: auto; }
  table.users { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; overflow: hidden; }
  table.users th, table.users td { text-align: left; padding: 9px 12px; font-size: 0.85rem; border-bottom: 1px solid #eef0f4; }
  table.users th { background: #f0f2f5; color: #5a6072; text-transform: uppercase; letter-spacing: 0.04em; font-size: 0.7rem; }
  table.users tr:last-child td { border-bottom: none; }
  table.users td.num { color: #9aa0ac; width: 38px; }
  table.users td.id { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.78rem; color: #3a4256; }
  table.users td.muted { color: #9aa0ac; }
  .pill { display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: 0.72rem; font-weight: 600; }
  .pill.pro { background: #e6f4ea; color: #1e7a3b; }
  .pill.free { background: #eef0f4; color: #5a6072; }
  .pill.status { background: #f0f2f5; color: #5a6072; font-weight: 500; }
  .pill.ok { background: #e6f4ea; color: #1e7a3b; }
  .pill.fail { background: #fdecea; color: #842029; }
  .pill.type { background: #eef0f4; color: #3a4256; font-weight: 500; }
  table.users td.url { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.78rem; color: #3a4256; word-break: break-all; }
  table.users tr.clickable { cursor: pointer; }
  table.users tr.clickable:hover td { background: #f5f7fa; }
  .overlay { position: fixed; inset: 0; background: rgba(12,13,18,0.45); display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px; overflow-y: auto; z-index: 50; }
  .modal { background: #fff; border-radius: 14px; width: 100%; max-width: 1080px; box-shadow: 0 24px 70px rgba(0,0,0,0.28); overflow: hidden; }
  .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 18px 24px; border-bottom: 1px solid #eef0f4; background: #fafbfc; }
  .modal-head h2 { margin: 0; font-size: 1.05rem; }
  .modal-head .uid { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.75rem; color: #9aa0ac; margin-top: 2px; }
  .modal-close { border: none; background: #f0f2f5; border-radius: 6px; width: 30px; height: 30px; font-size: 1.1rem; line-height: 1; cursor: pointer; color: #5a6072; }
  .modal-close:hover { background: #e3e6eb; }
  .modal-body { padding: 18px 24px; }
  .modal-body table.users { margin: 0; }
  td.params { font-size: 0.78rem; color: #5a6072; }
  .pager { display: flex; align-items: center; gap: 6px; margin-top: 14px; flex-wrap: wrap; }
  .page-btn { border: 1px solid #d9dde4; background: #fff; border-radius: 6px; min-width: 30px; height: 30px; padding: 0 8px; font-size: 0.82rem; cursor: pointer; color: #3a4256; }
  .page-btn:hover:not(:disabled) { background: #f5f7fa; }
  .page-btn.active { background: #1a1d24; border-color: #1a1d24; color: #fff; font-weight: 600; }
  .page-btn:disabled { opacity: 0.4; cursor: default; }
  .copy-btn { border: none; background: transparent; cursor: pointer; color: #9aa0ac; font-size: 0.85rem; line-height: 1; padding: 2px 4px; border-radius: 4px; vertical-align: middle; }
  .copy-btn:hover { background: #eef0f4; color: #3a4256; }
  td.url .copy-btn { margin-left: 6px; }
  .kv { display: flex; align-items: center; gap: 8px; }
  .kv + .kv { margin-top: 2px; }
  .kv-label { color: #9aa0ac; font-size: 0.78rem; font-weight: 600; }
  .modal-head .kv h2 { margin: 0; }
</style>
</head>
<body>
<button class="reload" onclick="load()">Reload</button>
<h1>Web2Wireframe — admin stats</h1>
<div class="sub" id="generated">Loading…</div>
<div id="root"></div>
<section id="users-section"></section>
<section id="imports-section"></section>
<div id="modal-root"></div>
<script>
function fmtUsd(cents) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

function token() {
  // Token lives in URL hash so it never reaches the server access log.
  const m = location.hash.match(/token=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

// HTML-escape any value before interpolating into innerHTML. The dashboard
// only renders numeric fields from a trusted admin endpoint today, but
// future contributors should not have to audit this template every time the
// stats payload grows — defense in depth.
function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function card(label, value, meta) {
  return '<div class="card">'
    + '<div class="card-label">' + esc(label) + '</div>'
    + '<div class="card-value">' + esc(value) + '</div>'
    + (meta ? '<div class="card-meta">' + esc(meta) + '</div>' : '')
    + '</div>';
}

// ── Users table: client-side filter + sort over the full roster ──────────
// Built with DOM methods (createElement + textContent) rather than string
// concatenation so user-controlled values (email, figmaUserId) can never be
// interpreted as markup — no escaping to get wrong.
var USERS = [];
var view = { filter: "all", sort: "recent", page: 1 };

function el(tag, opts) {
  var node = document.createElement(tag);
  opts = opts || {};
  if (opts.className) node.className = opts.className;
  if (opts.text != null) node.textContent = String(opts.text);
  if (opts.onClick) node.addEventListener("click", opts.onClick);
  return node;
}

// Numbered pager shared by the Recent imports feed and the per-user modal.
// Returns null when everything fits on one page (caller skips appending it).
function pager(total, page, pageSize, onGo) {
  var totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  var wrap = el("div", { className: "pager" });
  var prev = el("button", { className: "page-btn", text: "‹", onClick: function () { if (page > 1) onGo(page - 1); } });
  if (page <= 1) prev.disabled = true;
  wrap.appendChild(prev);
  for (var p = 1; p <= totalPages; p++) {
    (function (pp) {
      wrap.appendChild(el("button", {
        className: "page-btn" + (pp === page ? " active" : ""),
        text: String(pp),
        onClick: function () { onGo(pp); },
      }));
    })(p);
  }
  var next = el("button", { className: "page-btn", text: "›", onClick: function () { if (page < totalPages) onGo(page + 1); } });
  if (page >= totalPages) next.disabled = true;
  wrap.appendChild(next);
  return wrap;
}

// Small inline copy-to-clipboard button. stopPropagation so clicking it inside
// a clickable row does not also open the row's modal.
function copyBtn(value) {
  var b = el("button", { className: "copy-btn", text: "⧉" });
  b.title = "Copy";
  b.addEventListener("click", function (ev) {
    ev.stopPropagation();
    try { navigator.clipboard.writeText(String(value)); } catch (err) {}
    var prev = b.textContent;
    b.textContent = "✓";
    setTimeout(function () { b.textContent = prev; }, 1000);
  });
  return b;
}

function fmtDate(iso) {
  if (!iso) return "—";
  var d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function filteredSorted() {
  var rows = USERS.slice();
  if (view.filter === "pro") rows = rows.filter(function (u) { return u.plan === "pro"; });
  else if (view.filter === "free") rows = rows.filter(function (u) { return u.plan === "free"; });
  if (view.sort === "imports") rows.sort(function (a, b) { return (b.imports || 0) - (a.imports || 0); });
  else rows.sort(function (a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
  return rows;
}

function mkBtn(group, key, label) {
  return el("button", {
    className: "btn" + (view[group] === key ? " active" : ""),
    text: label,
    onClick: function () { view[group] = key; view.page = 1; paintUsers(); },
  });
}

function renderUsers() {
  var rows = filteredSorted();
  var frag = document.createDocumentFragment();
  frag.appendChild(el("h2", { text: "Users" }));

  var toolbar = el("div", { className: "toolbar" });
  var filterGroup = el("div", { className: "group" });
  filterGroup.appendChild(mkBtn("filter", "all", "ყველა"));
  filterGroup.appendChild(mkBtn("filter", "pro", "Pro (გადახდილი)"));
  filterGroup.appendChild(mkBtn("filter", "free", "Free"));
  var sortGroup = el("div", { className: "group" });
  sortGroup.appendChild(mkBtn("sort", "recent", "ბოლოს დამატებული"));
  sortGroup.appendChild(mkBtn("sort", "imports", "ყველაზე აქტიური"));
  toolbar.appendChild(filterGroup);
  toolbar.appendChild(el("div", { className: "sep" }));
  toolbar.appendChild(sortGroup);
  toolbar.appendChild(el("span", { className: "count", text: rows.length + " / " + USERS.length + " user(s)" }));
  frag.appendChild(toolbar);

  var table = el("table", { className: "users" });
  var thead = el("thead");
  var htr = el("tr");
  ["#", "ID", "Email", "Plan", "Status", "Imports", "Joined"].forEach(function (h) {
    htr.appendChild(el("th", { text: h }));
  });
  thead.appendChild(htr);
  table.appendChild(thead);

  var tbody = el("tbody");
  if (!rows.length) {
    var emptyTd = el("td", { className: "muted", text: "No users" });
    emptyTd.colSpan = 7;
    emptyTd.style.textAlign = "center";
    emptyTd.style.padding = "18px";
    var emptyTr = el("tr");
    emptyTr.appendChild(emptyTd);
    tbody.appendChild(emptyTr);
  }
  var pageRows = rows.slice((view.page - 1) * 20, view.page * 20);
  pageRows.forEach(function (u, i) {
    var tr = el("tr", { className: "clickable", onClick: function () { openUserImports(u.figmaUserId, u.email); } });
    tr.appendChild(el("td", { className: "num", text: (view.page - 1) * 20 + i + 1 }));
    tr.appendChild(el("td", { className: "id", text: u.figmaUserId }));
    tr.appendChild(u.email ? el("td", { text: u.email }) : el("td", { className: "muted", text: "—" }));
    var planTd = el("td");
    planTd.appendChild(el("span", { className: "pill " + (u.plan === "pro" ? "pro" : "free"), text: u.plan }));
    tr.appendChild(planTd);
    var statusTd = el("td");
    statusTd.appendChild(el("span", { className: "pill status", text: u.status }));
    tr.appendChild(statusTd);
    tr.appendChild(el("td", { text: u.imports }));
    tr.appendChild(el("td", { className: "muted", text: fmtDate(u.createdAt) }));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  frag.appendChild(table);

  var pg = pager(rows.length, view.page, 20, function (p) { view.page = p; paintUsers(); });
  if (pg) frag.appendChild(pg);
  return frag;
}

function paintUsers() {
  var c = document.getElementById("users-section");
  if (c) c.replaceChildren(renderUsers());
}

// ── Recent imports: who imported which site, and what failed ─────────────
// Same DOM-method rendering as the users table — sourceUrl/title are
// user-controlled, so they are only ever set via textContent.
var IMPORTS = [];
var importView = { filter: "all", page: 1 };

function fmtWhen(iso) {
  if (!iso) return "—";
  var d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function filteredImports() {
  if (importView.filter === "failed") return IMPORTS.filter(function (e) { return !e.success; });
  return IMPORTS.slice();
}

function mkImportBtn(key, label) {
  return el("button", {
    className: "btn" + (importView.filter === key ? " active" : ""),
    text: label,
    onClick: function () { importView.filter = key; importView.page = 1; paintImports(); },
  });
}

function renderImports() {
  var rows = filteredImports();
  var frag = document.createDocumentFragment();
  frag.appendChild(el("h2", { text: "Recent imports" }));

  var toolbar = el("div", { className: "toolbar" });
  var group = el("div", { className: "group" });
  group.appendChild(mkImportBtn("all", "ყველა"));
  group.appendChild(mkImportBtn("failed", "ჩავარდნილი"));
  toolbar.appendChild(group);
  toolbar.appendChild(el("span", { className: "count", text: rows.length + " / " + IMPORTS.length + " import(s)" }));
  frag.appendChild(toolbar);

  var table = el("table", { className: "users" });
  var thead = el("thead");
  var htr = el("tr");
  ["When", "Email", "URL", "Type", "Viewports", "Result"].forEach(function (h) {
    htr.appendChild(el("th", { text: h }));
  });
  thead.appendChild(htr);
  table.appendChild(thead);

  var tbody = el("tbody");
  if (!rows.length) {
    var emptyTd = el("td", { className: "muted", text: "No imports yet" });
    emptyTd.colSpan = 6;
    emptyTd.style.textAlign = "center";
    emptyTd.style.padding = "18px";
    var emptyTr = el("tr");
    emptyTr.appendChild(emptyTd);
    tbody.appendChild(emptyTr);
  }
  var pageRows = rows.slice((importView.page - 1) * 10, importView.page * 10);
  pageRows.forEach(function (e) {
    var tr = el("tr", { className: "clickable", onClick: function () { openUserImports(e.figmaUserId, e.email); } });
    tr.appendChild(el("td", { className: "muted", text: fmtWhen(e.createdAt) }));
    tr.appendChild(e.email ? el("td", { text: e.email }) : el("td", { className: "muted", text: "—" }));
    var urlTd = el("td", { className: "url" });
    urlTd.appendChild(el("span", { text: e.sourceUrl }));
    urlTd.appendChild(copyBtn(e.sourceUrl));
    tr.appendChild(urlTd);
    var typeTd = el("td");
    typeTd.appendChild(el("span", { className: "pill type", text: e.type }));
    tr.appendChild(typeTd);
    tr.appendChild(el("td", { className: "muted", text: (e.viewports || []).join(", ") || "—" }));
    var resTd = el("td");
    if (e.success) {
      resTd.appendChild(el("span", { className: "pill ok", text: "✓" }));
    } else {
      resTd.appendChild(el("span", { className: "pill fail", text: "✗ " + (e.errorCode || "error") }));
    }
    tr.appendChild(resTd);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  frag.appendChild(table);

  var pg = pager(rows.length, importView.page, 10, function (p) { importView.page = p; paintImports(); });
  if (pg) frag.appendChild(pg);
  return frag;
}

function paintImports() {
  var c = document.getElementById("imports-section");
  if (c) c.replaceChildren(renderImports());
}

// ── Per-user drill-down: click a user row → modal with their import history ──
function fmtParams(p) {
  if (!p) return "—";
  var parts = [];
  if (p.colorMode) parts.push("color:" + p.colorMode);
  if (p.typographyMode) parts.push("font:" + p.typographyMode);
  if (p.textMode) parts.push("text:" + p.textMode);
  if (p.pluginFont) parts.push("typeface:" + p.pluginFont);
  return parts.length ? parts.join(" · ") : "—";
}

function closeModal() {
  var o = document.getElementById("modal-root");
  if (o) o.replaceChildren();
}

// Modal drill-down state — set by openUserImports, read by renderUserImports so
// the in-modal pager can re-render a different page without re-fetching.
var MODAL = { email: "", figmaUserId: "", imports: [], page: 1 };

function paintModal() {
  var root = document.getElementById("modal-root");
  if (root) root.replaceChildren(renderUserImports());
}

function renderUserImports() {
  var email = MODAL.email;
  var figmaUserId = MODAL.figmaUserId;
  var imports = MODAL.imports;

  var overlay = el("div", { className: "overlay" });
  overlay.addEventListener("click", function (e) { if (e.target === overlay) closeModal(); });

  var modal = el("div", { className: "modal" });

  var head = el("div", { className: "modal-head" });
  var titleWrap = el("div");

  var emailRow = el("div", { className: "kv" });
  emailRow.appendChild(el("span", { className: "kv-label", text: "email:" }));
  emailRow.appendChild(el("h2", { text: email || "(no email)" }));
  if (email) emailRow.appendChild(copyBtn(email));
  titleWrap.appendChild(emailRow);

  var idRow = el("div", { className: "kv" });
  idRow.appendChild(el("span", { className: "kv-label", text: "id:" }));
  idRow.appendChild(el("div", { className: "uid", text: figmaUserId }));
  if (figmaUserId) idRow.appendChild(copyBtn(figmaUserId));
  titleWrap.appendChild(idRow);

  head.appendChild(titleWrap);
  head.appendChild(el("button", { className: "modal-close", text: "✕", onClick: closeModal }));
  modal.appendChild(head);

  var body = el("div", { className: "modal-body" });

  var table = el("table", { className: "users" });
  var thead = el("thead");
  var htr = el("tr");
  ["When", "Type", "URL", "Viewports", "Params", "Result"].forEach(function (h) {
    htr.appendChild(el("th", { text: h }));
  });
  thead.appendChild(htr);
  table.appendChild(thead);

  var tbody = el("tbody");
  if (!imports.length) {
    var emptyTd = el("td", { className: "muted", text: "No imports yet" });
    emptyTd.colSpan = 6;
    emptyTd.style.textAlign = "center";
    emptyTd.style.padding = "18px";
    var emptyTr = el("tr");
    emptyTr.appendChild(emptyTd);
    tbody.appendChild(emptyTr);
  }
  var pageImports = imports.slice((MODAL.page - 1) * 10, MODAL.page * 10);
  pageImports.forEach(function (e) {
    var tr = el("tr");
    tr.appendChild(el("td", { className: "muted", text: fmtWhen(e.createdAt) }));
    var typeTd = el("td");
    typeTd.appendChild(el("span", { className: "pill type", text: e.type }));
    tr.appendChild(typeTd);
    var urlTd = el("td", { className: "url" });
    urlTd.appendChild(el("span", { text: e.sourceUrl }));
    urlTd.appendChild(copyBtn(e.sourceUrl));
    tr.appendChild(urlTd);
    tr.appendChild(el("td", { className: "muted", text: (e.viewports || []).join(", ") || "—" }));
    tr.appendChild(el("td", { className: "params", text: fmtParams(e.params) }));
    var resTd = el("td");
    if (e.success) {
      resTd.appendChild(el("span", { className: "pill ok", text: "✓" }));
    } else {
      resTd.appendChild(el("span", { className: "pill fail", text: "✗ " + (e.errorCode || "error") }));
    }
    tr.appendChild(resTd);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);

  var pg = pager(imports.length, MODAL.page, 10, function (p) { MODAL.page = p; paintModal(); });
  if (pg) body.appendChild(pg);

  modal.appendChild(body);
  overlay.appendChild(modal);
  return overlay;
}

async function openUserImports(figmaUserId, email) {
  var root = document.getElementById("modal-root");
  if (!root) return;
  // Loading state
  var loading = el("div", { className: "overlay" });
  loading.addEventListener("click", function (e) { if (e.target === loading) closeModal(); });
  var lm = el("div", { className: "modal" });
  lm.appendChild(el("div", { className: "modal-body muted", text: "Loading…" }));
  loading.appendChild(lm);
  root.replaceChildren(loading);

  try {
    var t = token();
    var res = await fetch("/api/admin/stats/imports?figmaUserId=" + encodeURIComponent(figmaUserId), {
      headers: t ? { "Authorization": "Bearer " + t } : {},
    });
    if (!res.ok) {
      var em = el("div", { className: "overlay" });
      em.addEventListener("click", function (e) { if (e.target === em) closeModal(); });
      var emc = el("div", { className: "modal" });
      emc.appendChild(el("div", { className: "modal-body error", text: "Failed to load imports: HTTP " + res.status }));
      em.appendChild(emc);
      root.replaceChildren(em);
      return;
    }
    var d = await res.json();
    MODAL = { email: email, figmaUserId: figmaUserId, imports: d.imports || [], page: 1 };
    paintModal();
  } catch (e) {
    closeModal();
  }
}

document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

async function load() {
  document.getElementById("root").replaceChildren();
  document.getElementById("generated").textContent = "Loading…";
  let res;
  try {
    const t = token();
    res = await fetch("/api/admin/stats", {
      headers: t ? { "Authorization": "Bearer " + t } : {},
    });
  } catch (e) {
    document.getElementById("root").innerHTML = '<div class="error">Network error: ' + esc(e.message) + '</div>';
    return;
  }
  if (res.status === 401) {
    document.getElementById("root").innerHTML = '<div class="error">Unauthorized. Append <code>#token=&lt;ADMIN_TOKEN&gt;</code> to the URL.</div>';
    return;
  }
  if (!res.ok) {
    document.getElementById("root").innerHTML = '<div class="error">Failed: HTTP ' + esc(res.status) + '</div>';
    return;
  }
  const d = await res.json();
  document.getElementById("generated").textContent =
    "As of " + new Date(d.generatedAt).toLocaleString();

  USERS = (d.users && d.users.list) || [];
  paintUsers();

  IMPORTS = d.recentImports || [];
  paintImports();

  let html = "";
  html += '<section><h2>Users</h2><div class="grid">'
    + card("Total users", d.users.total)
    + card("Pro (active subs)", d.users.byPlan.pro, d.users.byStatus.canceled + " canceled")
    + card("Free", d.users.byPlan.free)
    + card("New (last 7d)", d.users.new7d)
    + card("New (last 30d)", d.users.new30d)
    + card("Active (used in 30d)", d.users.active30d, "MAU proxy")
    + "</div></section>";

  html += '<section><h2>Revenue (30d)</h2><div class="grid">'
    + card("Gross (last 30d)", fmtUsd(d.revenue.gross30dCents), d.revenue.approved30d + " approved charges")
    + card("Refunded (30d)", fmtUsd(d.revenue.refunded30dCents), d.revenue.reversed30d + " reversed")
    + card("Net (30d)", fmtUsd(d.revenue.net30dCents))
    + card("Last 7 days", fmtUsd(d.revenue.approved7d * 1600), d.revenue.approved7d + " approved")
    + "</div></section>";

  html += '<section><h2>Payments</h2><div class="grid">'
    + card("Declined (7d)", d.payments.declined7d, "card decline + 3DS timeout")
    + card("Refunds (30d)", d.payments.refunds30d, "applied to user account")
    + card("Pro activations (30d)", d.payments.proActivations30d, "audit-log source")
    + card("Conversion rate", d.conversion.rate30dPercent + "%", "new30d → Pro")
    + "</div></section>";

  html += '<section style="margin-top:32px; color:#5a6072; font-size:0.85rem;">'
    + '<p>Numbers from MongoDB live — refresh anytime. For Flitt-side ground truth, cross-check against the Flitt settlement report.</p>'
    + '<p>Detailed lookups: <code>curl /api/admin/license/recent</code> · <code>curl /api/admin/license/lookup-by-email?email=...</code></p>'
    + '</section>';

  document.getElementById("root").innerHTML = html;
}

window.addEventListener("hashchange", load);
load();
</script>
</body>
</html>`;

export default router;
