#!/usr/bin/env node
/**
 * Dev-only log receiver for the Figma plugin's dev-log bridge.
 *
 * The plugin UI iframe POSTs batched console/logger entries here (see
 * src/utils/devLogger.ts); this server prints them to stdout so Claude (or a
 * human) can tail the development plugin's console output, which Figma desktop
 * otherwise exposes nowhere reachable.
 *
 * Run:  node packages/figma-plugin/scripts/devlog-server.mjs
 * Stop: Ctrl+C
 *
 * This is a standalone dev tool — it is NOT bundled into the plugin and never
 * ships. Listens only on 127.0.0.1.
 */

import http from "node:http";

const PORT = 3999;
const HOST = "127.0.0.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const LEVEL_TAG = { log: "LOG ", info: "INFO", warn: "WARN", error: "ERR " };

function ts() {
  return new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/log") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      try {
        const entries = JSON.parse(body);
        for (const e of Array.isArray(entries) ? entries : [entries]) {
          const tag = LEVEL_TAG[e.level] ?? e.level ?? "LOG ";
          const ctx = e.ctx === "main" ? "main" : "ui  ";
          process.stdout.write(`${ts()} [${ctx}] ${tag} ${e.msg}\n`);
        }
      } catch {
        process.stdout.write(`${ts()} [recv] (unparseable payload)\n`);
      }
      res.writeHead(204, CORS);
      res.end();
    });
    return;
  }

  res.writeHead(404, CORS);
  res.end();
});

server.listen(PORT, HOST, () => {
  process.stdout.write(
    `${ts()} [recv] dev-log receiver listening on http://${HOST}:${PORT}/log — waiting for plugin logs…\n`,
  );
});
