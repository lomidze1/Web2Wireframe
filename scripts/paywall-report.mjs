#!/usr/bin/env node
/**
 * Paywall report — "does anyone actually reach the Free cap?"
 *
 * The one number that tells us whether $16 is a pricing problem or a
 * traffic/activation problem. Reads live production stats via
 * /api/admin/stats and prints aggregates only (no emails, no user ids).
 *
 * Usage:
 *   ADMIN_TOKEN=... node scripts/paywall-report.mjs
 *   ADMIN_TOKEN=... W2W_BASE=http://localhost:3002 node scripts/paywall-report.mjs
 */
import fs from "node:fs";

const token = process.env.ADMIN_TOKEN;
if (!token) {
  console.error("Missing ADMIN_TOKEN env var. Run:\n  ADMIN_TOKEN=$(grep '^ADMIN_TOKEN=' .env | cut -d= -f2-) node scripts/paywall-report.mjs");
  process.exit(1);
}

const BASE = process.env.W2W_BASE || "https://api.web2wireframe.design";
const r = await fetch(`${BASE}/api/admin/stats`, {
  headers: { Authorization: `Bearer ${token}` },
});
console.log("HTTP", r.status, "from", BASE);
if (!r.ok) {
  console.error((await r.text()).slice(0, 300));
  process.exit(1);
}
const d = await r.json();

const OUT = process.env.W2W_OUT;
if (OUT) {
  // Aggregates-only dump: strip the PII-bearing roster and import feed urls.
  const safe = { ...d, users: { ...d.users, list: undefined }, recentImports: undefined };
  fs.writeFileSync(OUT, JSON.stringify(safe, null, 2));
}

const FREE_LIMIT = 10;
const users = d.users.list || [];
const imports = users.map((u) => u.imports || 0);
const inRange = (min, max) => imports.filter((n) => n >= min && n <= max).length;

console.log("\n=== USERS ===");
console.log("total:", d.users.total, "| free:", d.users.byPlan.free, "| pro:", d.users.byPlan.pro, "| canceled:", d.users.byStatus.canceled);
console.log("new 7d:", d.users.new7d, "| new 30d:", d.users.new30d, "| distinct importers 30d:", d.users.active30d);

console.log("\n=== usage.imports DISTRIBUTION (current cycle) ===");
console.log("0 imports         :", inRange(0, 0));
console.log("1 import          :", inRange(1, 1));
console.log("2-4 imports       :", inRange(2, 4));
console.log("5-9 imports       :", inRange(5, 9));
console.log(">=10 (AT/OVER CAP):", imports.filter((n) => n >= FREE_LIMIT).length);
console.log("max seen:", imports.length ? Math.max(...imports) : 0, "| sum:", imports.reduce((a, b) => a + b, 0));

console.log("\n=== THE PAYWALL NUMBER ===");
const activated = imports.filter((n) => n > 0).length;
const hitCap = imports.filter((n) => n >= FREE_LIMIT).length;
const pct = (n) => ((n / (d.users.total || 1)) * 100).toFixed(1) + "%";
console.log(`activated (>=1 import): ${activated} / ${d.users.total} = ${pct(activated)}`);
console.log(`hit free cap (>=${FREE_LIMIT})  : ${hitCap} / ${d.users.total} = ${pct(hitCap)}`);

console.log("\n=== REVENUE / PAYMENTS ===");
console.log("revenue:", JSON.stringify(d.revenue));
console.log("payments:", JSON.stringify(d.payments));
console.log("conversion 30d:", d.conversion.rate30dPercent + "%");

const ri = d.recentImports || [];
console.log("\n=== RECENT IMPORT EVENTS (last", ri.length, ") ===");
const byType = {}, byErr = {}, byUser = {};
let ok = 0, fail = 0;
for (const e of ri) {
  byType[e.type] = (byType[e.type] || 0) + 1;
  if (e.success) ok++;
  else {
    fail++;
    byErr[e.errorCode || "unknown"] = (byErr[e.errorCode || "unknown"] || 0) + 1;
  }
  byUser[e.figmaUserId] = (byUser[e.figmaUserId] || 0) + 1;
}
console.log("by type:", byType);
console.log("ok:", ok, "fail:", fail, "| fail rate:", ri.length ? ((fail / ri.length) * 100).toFixed(1) + "%" : "n/a");
console.log("error codes:", byErr);
console.log("distinct users in feed:", Object.keys(byUser).length);
console.log("events per user:", Object.values(byUser).sort((a, b) => b - a).join(", "));
if (ri.length) console.log("window:", ri[ri.length - 1].createdAt, "->", ri[0].createdAt);
