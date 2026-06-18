import { Router, type Request, type Response } from "express";
import { License } from "../../models/License.js";
import { WebhookEvent } from "../../models/WebhookEvent.js";
import { LicenseAudit } from "../../models/LicenseAudit.js";
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

    res.json({
      generatedAt: now.toISOString(),
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
</style>
</head>
<body>
<button class="reload" onclick="load()">Reload</button>
<h1>Web2Wireframe — admin stats</h1>
<div class="sub" id="generated">Loading…</div>
<div id="root"></div>
<section id="users-section"></section>
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
var view = { filter: "all", sort: "recent" };

function el(tag, opts) {
  var node = document.createElement(tag);
  opts = opts || {};
  if (opts.className) node.className = opts.className;
  if (opts.text != null) node.textContent = String(opts.text);
  if (opts.onClick) node.addEventListener("click", opts.onClick);
  return node;
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
    onClick: function () { view[group] = key; paintUsers(); },
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
  rows.forEach(function (u, i) {
    var tr = el("tr");
    tr.appendChild(el("td", { className: "num", text: i + 1 }));
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
  return frag;
}

function paintUsers() {
  var c = document.getElementById("users-section");
  if (c) c.replaceChildren(renderUsers());
}

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
