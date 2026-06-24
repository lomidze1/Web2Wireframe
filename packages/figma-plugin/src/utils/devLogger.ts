/**
 * Dev-only log bridge.  ⚠️ NEVER ships to production.
 *
 * Figma's plugin sandbox and UI iframe have no console Claude can read, and
 * Figma desktop blocks remote debugging. The only way out of the sandbox is a
 * network request from the UI iframe. So this module mirrors console/logger
 * output to a local receiver (scripts/devlog-server.mjs) that Claude tails.
 *
 *   sandbox console.* / logger.*  --figma.ui.postMessage(__W2W_DEVLOG__)-->  UI
 *   UI console.* + window errors  --batched fetch-->  http://localhost:3999/log
 *
 * Activation is gated by DEV_LOGGER_ENABLED (= !USE_PRODUCTION). The production
 * build flips USE_PRODUCTION true, so esbuild --minify strips every caller and
 * tree-shakes this entire module out of the bundle. A post-build grep gate in
 * build-prod.mjs fails the build if the sentinel below ever leaks.
 */

/** Sentinel — also the message type. build-prod.mjs greps for this string. */
export const DEVLOG_MESSAGE_TYPE = "__W2W_DEVLOG__";

/** Local receiver endpoint (dev only; whitelisted via devAllowedDomains). */
export const DEVLOG_ENDPOINT = "http://localhost:3999/log";

const FLUSH_MS = 250;
const MAX_BATCH = 50;
const LEVELS = ["log", "info", "warn", "error"] as const;
type Level = (typeof LEVELS)[number];

interface DevLogEntry {
  level: Level;
  msg: string;
  ctx: "main" | "ui";
}

let installed = false;
let teardown: (() => void) | null = null;

function serialize(args: unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

export function installDevLogger(): void {
  if (installed) return;
  installed = true;

  const isSandbox =
    typeof figma !== "undefined" && !!(figma as { ui?: unknown }).ui;

  // Snapshot the real console methods before overriding (anti-recursion).
  const original = {} as Record<Level, (...args: unknown[]) => void>;
  for (const lvl of LEVELS) {
    original[lvl] = (console[lvl] as (...args: unknown[]) => void).bind(console);
  }

  const restoreConsole = () => {
    for (const lvl of LEVELS) console[lvl] = original[lvl];
  };

  if (isSandbox) {
    // Sandbox cannot fetch — relay each line to the UI iframe.
    for (const lvl of LEVELS) {
      console[lvl] = (...args: unknown[]) => {
        original[lvl](...args);
        try {
          figma.ui.postMessage({
            type: DEVLOG_MESSAGE_TYPE,
            data: { level: lvl, msg: serialize(args), ctx: "main" },
          });
        } catch {
          // postMessage can fail before UI is ready — non-fatal.
        }
      };
    }
    teardown = restoreConsole;
    return;
  }

  // UI iframe — buffer entries and POST them in batches.
  const buffer: DevLogEntry[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    if (buffer.length === 0) return;
    const batch = buffer.splice(0, buffer.length);
    try {
      void fetch(DEVLOG_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      }).catch(() => {
        // Receiver offline — drop silently, don't spam.
      });
    } catch {
      // Synchronous fetch failure — ignore.
    }
  };

  const enqueue = (entry: DevLogEntry) => {
    buffer.push(entry);
    if (buffer.length >= MAX_BATCH) {
      flush();
      return;
    }
    if (timer === null) timer = setTimeout(flush, FLUSH_MS);
  };

  for (const lvl of LEVELS) {
    console[lvl] = (...args: unknown[]) => {
      original[lvl](...args);
      enqueue({ level: lvl, msg: serialize(args), ctx: "ui" });
    };
  }

  // Relay lines forwarded from the sandbox.
  const onMessage = (event: MessageEvent) => {
    const data = event.data as { pluginMessage?: unknown } | undefined;
    const msg = (data?.pluginMessage ?? data) as
      | { type?: string; data?: DevLogEntry }
      | undefined;
    if (msg?.type === DEVLOG_MESSAGE_TYPE && msg.data) {
      enqueue({
        level: msg.data.level,
        msg: msg.data.msg,
        ctx: msg.data.ctx ?? "main",
      });
    }
  };

  const onUnhandled = (event: PromiseRejectionEvent) => {
    enqueue({
      level: "error",
      msg: `unhandledrejection: ${String(event.reason)}`,
      ctx: "ui",
    });
  };

  window.addEventListener("message", onMessage);
  window.addEventListener("unhandledrejection", onUnhandled);
  window.onerror = (message, source, lineno, colno) => {
    enqueue({
      level: "error",
      msg: `window.onerror: ${String(message)} @ ${source ?? "?"}:${lineno ?? 0}:${colno ?? 0}`,
      ctx: "ui",
    });
    return false;
  };

  teardown = () => {
    restoreConsole();
    window.removeEventListener("message", onMessage);
    window.removeEventListener("unhandledrejection", onUnhandled);
    window.onerror = null;
    if (timer !== null) clearTimeout(timer);
  };
}

/** Test-only: undo installDevLogger (restore console, drop listeners). */
export function __resetDevLoggerForTests(): void {
  if (teardown) teardown();
  teardown = null;
  installed = false;
}
