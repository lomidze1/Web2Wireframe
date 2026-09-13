#!/usr/bin/env node
/**
 * Local receiver for the W2W Tree Dump plugin.
 *
 * The plugin's invisible UI iframe POSTs a serialized layer tree here; this
 * server writes it to dumps/ so it can be read from disk. Nothing is sent
 * anywhere else — it listens on 127.0.0.1 only.
 *
 * Run:  node tools/figma-tree-dump/server.mjs
 * Stop: Ctrl+C
 *
 * Separate from packages/figma-plugin/scripts/devlog-server.mjs (port 3999) on
 * purpose: that one is wired into the plugin's prod leak-gate, this one is not.
 * Both can run at the same time.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PORT = 3998;
// Figma's manifest only accepts the "localhost" spelling, and a browser fetch to
// localhost may resolve to ::1 or 127.0.0.1 depending on the platform. Binding
// both loopback addresses removes the guesswork. Neither is reachable off-box.
const HOSTS = ["127.0.0.1", "::1"];
const MAX_BODY = 64 * 1024 * 1024; // 64 MB — a 5000-node tree is far below this

const DUMP_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "dumps");

// Figma plugin iframes have a null origin, so the wildcard is required here.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/** Filesystem-safe fragment of a layer name, for the timestamped filename. */
export function slug(name, max = 40) {
  return String(name || "node")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .toLowerCase() || "node";
}

/**
 * Builds the dump filename from every selected root, not just the first — a
 * two-frame comparison dump has to say which two frames it holds.
 */
export function dumpFileName(parsed, stamp) {
  const roots = Array.isArray(parsed.selection) ? parsed.selection : [parsed.selection];
  // Two names share the filename, so each gets a shorter slice of it.
  const max = roots.length > 1 ? 24 : 40;
  let label = roots.slice(0, 2).map((root) => slug(root && root.name, max)).join("-vs-");
  if (roots.length > 2) label += `-plus-${roots.length - 2}`;

  return `${stamp}-${label}.json`;
}

function send(res, status, body) {
  const payload = body === undefined ? "" : JSON.stringify(body);
  res.writeHead(status, { ...CORS, "Content-Type": "application/json" });
  res.end(payload);
}

function write(raw) {
  const parsed = JSON.parse(raw);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = dumpFileName(parsed, stamp);

  fs.mkdirSync(DUMP_DIR, { recursive: true });
  const pretty = JSON.stringify(parsed, null, 2);
  fs.writeFileSync(path.join(DUMP_DIR, name), pretty);
  fs.writeFileSync(path.join(DUMP_DIR, "latest.json"), pretty);

  const kb = Math.round(Buffer.byteLength(pretty) / 1024);
  const cut = parsed.truncated?.length
    ? ` ⚠ ${parsed.truncated.length} subtree(s) cut`
    : "";
  process.stdout.write(
    `[dump] ${name} — ${parsed.nodeCount ?? "?"} nodes, ${kb} KB` +
      ` (page "${parsed.page ?? "?"}")${cut}\n`,
  );

  return name;
}

function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method !== "POST" || req.url !== "/tree") {
    send(res, 404, { ok: false, error: "POST /tree only" });
    return;
  }

  let raw = "";
  let aborted = false;

  req.on("data", (chunk) => {
    if (aborted) return;
    raw += chunk;
    if (raw.length > MAX_BODY) {
      aborted = true;
      process.stdout.write("[dump] payload too large — rejected\n");
      send(res, 413, { ok: false, error: "payload too large" });
      req.destroy();
    }
  });

  req.on("end", () => {
    if (aborted) return;
    try {
      const name = write(raw);
      send(res, 200, { ok: true, path: `dumps/${name}` });
    } catch (err) {
      process.stdout.write(`[dump] failed: ${err.message}\n`);
      send(res, 400, { ok: false, error: err.message });
    }
  });
}

/** Binds both loopback addresses. Skipped on import so tests can load this file. */
function listen() {
  const bound = [];
  for (const host of HOSTS) {
    const server = http.createServer(handler);
    // A machine with IPv6 disabled has no ::1 to bind — that is not fatal.
    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        process.stderr.write(`port ${PORT} already in use — is another receiver running?\n`);
        process.exit(1);
      }
      process.stderr.write(`[dump] could not bind ${host}: ${err.code}\n`);
    });
    server.listen(PORT, host, () => {
      bound.push(host);
      process.stdout.write(
        `tree-dump receiver listening on http://${host === "::1" ? "[::1]" : host}:${PORT}/tree\n`,
      );
      if (bound.length === 1) process.stdout.write(`writing dumps to ${DUMP_DIR}\n`);
    });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  listen();
}
