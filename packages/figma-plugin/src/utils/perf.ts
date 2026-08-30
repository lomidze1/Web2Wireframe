/**
 * Dev-only import profiler.  ⚠️ NEVER ships to production.
 *
 * A minimal port of h2d's `ue(label, fn)` accumulator: wrap a pipeline stage,
 * get a per-label row of {ms, count, err}, and print one table at the end of
 * the import. Their own numbers (28s capture / 15s node creation / 0.73s CSS
 * conversion) came out of exactly this — see ხარისხის_გაუმჯობესება/00-MASTER-REPORT.md §1.
 *
 * Two realms, one table: the UI iframe and the sandbox are separate JS realms
 * with separate module state, so the UI ships its rows along with the
 * `render-wireframe` message and the sandbox replays them through `mark()`
 * before printing.
 *
 * Gating: every entry point returns early on `!__W2W_DEV_LOG__` (a compile-time
 * esbuild define — see src/types/devlog-global.d.ts). The production build sets
 * it false, so the bodies below — including the `[w2w-perf]` sentinel that
 * scripts/build-prod.mjs greps for — are dead-code-eliminated.
 */

/** One accumulated row. `ms` stays 0 for volume metrics recorded via `count`. */
export interface PerfRow {
  ms: number;
  count: number;
  err: number;
}

const rows = new Map<string, PerfRow>();
/** Labels recorded via `count()` — reported as volume, excluded from the %. */
const volumeLabels = new Set<string>();
/**
 * Labels whose span runs *inside* another measured span (`node.font` inside
 * `node.text`). Reported separately with an ms/call average, and kept out of
 * the total so the parent isn't counted twice. The flag is sticky: once a
 * label is nested it stays nested, so a stray two-argument call can never
 * promote it back into the total.
 */
const nestedLabels = new Set<string>();

function row(label: string): PerfRow {
  let r = rows.get(label);
  if (!r) {
    r = { ms: 0, count: 0, err: 0 };
    rows.set(label, r);
  }
  return r;
}

/**
 * Time an async stage. Rethrows, counting the failure.
 * Pass `nested` when this span runs inside another measured one.
 */
export async function timed<T>(
  label: string,
  fn: () => Promise<T> | T,
  nested?: boolean
): Promise<T> {
  if (!__W2W_DEV_LOG__) return fn();
  const started = Date.now();
  if (nested) nestedLabels.add(label);
  const r = row(label);
  r.count++;
  try {
    return await fn();
  } catch (err) {
    r.err++;
    throw err;
  } finally {
    r.ms += Date.now() - started;
  }
}

/**
 * Time a synchronous stage. Rethrows, counting the failure.
 * Pass `nested` when this span runs inside another measured one.
 */
export function timedSync<T>(label: string, fn: () => T, nested?: boolean): T {
  if (!__W2W_DEV_LOG__) return fn();
  const started = Date.now();
  if (nested) nestedLabels.add(label);
  const r = row(label);
  r.count++;
  try {
    return fn();
  } catch (err) {
    r.err++;
    throw err;
  } finally {
    r.ms += Date.now() - started;
  }
}

/**
 * Record a span that was measured elsewhere — the UI→sandbox postMessage hop,
 * or a whole table handed over from the iframe.
 *
 * Negative durations are dropped: the two realms read `Date.now()` from the
 * same clock today, but a skewed reading would otherwise poison the total.
 */
export function mark(label: string, ms: number, nested?: boolean): void {
  if (!__W2W_DEV_LOG__) return;
  if (!(ms >= 0)) return;
  if (nested) nestedLabels.add(label);
  const r = row(label);
  r.ms += ms;
  r.count++;
}

/** Record a volume metric (frames, nodes, images) — no time, just a total. */
export function count(label: string, n: number): void {
  if (!__W2W_DEV_LOG__) return;
  volumeLabels.add(label);
  row(label).count += n;
}

/**
 * Hand this realm's timings over to the other one: label → ms, table cleared.
 * The UI iframe calls this and ships the result as `perfUi` on the
 * render-wireframe message; the sandbox replays it through `mark()`.
 */
export function handoff(): Record<string, number> {
  if (!__W2W_DEV_LOG__) return {};
  const out: Record<string, number> = {};
  rows.forEach((r, label) => {
    if (!volumeLabels.has(label)) out[label] = r.ms;
  });
  reset();
  return out;
}

/** Current table, for tests. */
export function snapshot(): Record<string, PerfRow> {
  const out: Record<string, PerfRow> = {};
  rows.forEach((r, label) => {
    out[label] = { ms: r.ms, count: r.count, err: r.err };
  });
  return out;
}

/** Drop everything, so the next import starts clean. */
export function reset(): void {
  rows.clear();
  volumeLabels.clear();
  nestedLabels.clear();
}

/**
 * Format the table (most expensive stage first) and clear it. The returned
 * string is what goes to the dev-log bridge.
 */
export function report(): string {
  if (!__W2W_DEV_LOG__) return "";

  const timings: Array<[string, PerfRow]> = [];
  const nested: Array<[string, PerfRow]> = [];
  const volumes: Array<[string, PerfRow]> = [];
  rows.forEach((r, label) => {
    if (volumeLabels.has(label)) volumes.push([label, r]);
    else if (nestedLabels.has(label)) nested.push([label, r]);
    else timings.push([label, r]);
  });
  timings.sort((a, b) => b[1].ms - a[1].ms);
  nested.sort((a, b) => b[1].ms - a[1].ms);

  const total = timings.reduce((sum, [, r]) => sum + r.ms, 0);
  const lines = ["[w2w-perf] import timings"];

  if (timings.length === 0 && nested.length === 0 && volumes.length === 0) {
    lines.push("  (no data)");
  }

  for (const [label, r] of timings) {
    const pct = total > 0 ? ((r.ms / total) * 100).toFixed(1) : "0.0";
    lines.push(
      "  " +
        label.padEnd(28) +
        String(r.ms).padStart(8) +
        "ms  ×" +
        String(r.count).padEnd(5) +
        pct.padStart(6) +
        "%" +
        (r.err > 0 ? `  (${r.err} err)` : "")
    );
  }
  if (timings.length > 0) {
    lines.push("  " + "TOTAL".padEnd(28) + String(total).padStart(8) + "ms");
  }

  if (nested.length > 0) {
    lines.push("  ── nested (already inside a row above) ──");
    for (const [label, r] of nested) {
      const avg = r.count > 0 ? (r.ms / r.count).toFixed(1) : "0.0";
      lines.push(
        "  " +
          label.padEnd(28) +
          String(r.ms).padStart(8) +
          "ms  ×" +
          String(r.count).padEnd(5) +
          (avg + "ms avg").padStart(12) +
          (r.err > 0 ? `  (${r.err} err)` : "")
      );
    }
  }

  if (volumes.length > 0) {
    lines.push("  ── volume ──");
    for (const [label, r] of volumes) {
      lines.push("  " + label.padEnd(28) + "×" + r.count);
    }
  }

  reset();
  return lines.join("\n");
}
