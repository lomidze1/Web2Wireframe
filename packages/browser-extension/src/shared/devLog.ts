/* eslint-disable no-console -- this module exists to mirror console output. */
/**
 * Dev-only log bridge for the service worker.  ⚠️ NEVER ships to the Web Store.
 *
 * Mirrors SW console output to the same local receiver the Figma plugin uses
 * (packages/figma-plugin/scripts/devlog-server.mjs → 127.0.0.1:3999), so what a
 * capture failed to get can be read without opening chrome://extensions.
 *
 * Gated by the compile-time `__W2W_DEV_LOG__` define (vite.config*.ts):
 * `W2W_DEV_LOG=1 npm run build` turns it on; a plain `npm run build` — the Web
 * Store zip — defines it false and the bundler strips every caller.
 */

// The flag lives with the content script, which the API image ships on its own.
import { DEV_LOG_ENABLED } from "../content/dev-log-flag";

export { DEV_LOG_ENABLED };

const ENDPOINT = "http://127.0.0.1:3999/log";
const FLUSH_MS = 250;
const MAX_BATCH = 50;
const LEVELS = ["log", "info", "warn", "error"] as const;
type Level = (typeof LEVELS)[number];

/** One console call as a single line: `%c` styling dropped, Errors readable. */
export function serializeDevLogArgs(args: unknown[]): string {
  const parts = [...args];
  if (typeof parts[0] === "string" && parts[0].includes("%c")) {
    const styleCount = (parts[0].match(/%c/g) ?? []).length;
    parts[0] = parts[0].replace(/%c/g, "");
    parts.splice(1, styleCount);
  }
  return parts
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try {
        return JSON.stringify(a) ?? String(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

let installed = false;

export function installSwDevLog(): void {
  if (!DEV_LOG_ENABLED || installed) return;
  installed = true;

  const buffer: Array<{ level: Level; msg: string; ctx: "sw" }> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    timer = null;
    if (buffer.length === 0) return;
    const batch = buffer.splice(0, buffer.length);
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch),
    }).catch(() => {
      // Receiver offline — drop silently.
    });
  };

  for (const level of LEVELS) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      buffer.push({ level, msg: serializeDevLogArgs(args), ctx: "sw" });
      if (buffer.length >= MAX_BATCH) flush();
      else if (timer === null) timer = setTimeout(flush, FLUSH_MS);
    };
  }
}

/** Something a capture could not get. No-op — and stripped — in the Web Store build. */
export function devWarn(...args: unknown[]): void {
  if (DEV_LOG_ENABLED) console.warn(...args);
}
