/**
 * Bounded "network settled" wait — Puppeteer-ის `networkidle*`-ის ჩანაცვლება.
 *
 * რატომ არსებობს:
 *
 * `installNavigationSsrfGuard()` რთავს `page.setRequestInterception(true)`-ს.
 * მისი ჩართვისას ზოგიერთი მოთხოვნა Puppeteer-ის in-flight მრიცხველში
 * სამუდამოდ ჩამოკიდებული რჩება — არც `requestfinished`, არც `requestfailed`
 * არ მოდის. ტიპური დამნაშავეები: Web Worker-ის სკრიპტები და fire-and-forget
 * ტრეკინგ-beacon-ები (`ad.doubleclick.net/activity;…`).
 *
 * შედეგად `waitUntil: "networkidle0"` (0 აქტიური 500ms-ის განმავლობაში)
 * ასეთ საიტზე **არასდროს** სრულდება და `page.goto` timeout-ზე ვარდება.
 * stripe.com-ზე ჩამოკიდებული ზუსტად 2-ია — ამიტომ `networkidle2`-ც მხოლოდ
 * შემთხვევით მუშაობს, ხოლო 3 ჩამოკიდებულის მქონე საიტი ისევ ჩავარდებოდა.
 *
 * ეს helper იმავე ლოდინს აკეთებს, ოღონდ სამი ხისტი წესით:
 *
 *   1. **age-out** — `stuckAfterMs`-ზე დიდხანს ღია მოთხოვნა აქტიურად აღარ
 *      ითვლება. ეს ხურავს პრობლემის მთელ კლასს, და არა ერთ საიტს.
 *   2. **არასდროს throw** — `maxWaitMs`-ის ამოწურვისას ბრუნდება
 *      `reason: "timeout"` და ექსტრაქცია გრძელდება. ლოდინის ევრისტიკა
 *      აღარასოდეს გახდება იმპორტის ჩავარდნის მიზეზი.
 *   3. **იატაკი** — `minWaitMs`-ზე ადრე არ ბრუნდება. საჭიროა `Page.reload`-ის
 *      შემდეგ, სადაც მოთხოვნები ჯერ დაწყებული არაა და in-flight = 0.
 */

import type { Page } from "puppeteer";

/** რა სიხშირით ვამოწმებთ მდგომარეობას. */
const POLL_MS = 100;

export interface NetworkSettleOptions {
  /** რამდენ ხანს უნდა იყოს ქსელი წყნარად, სანამ „დამშვიდებულად" ჩაითვლება. */
  idleMs?: number;
  /** ამაზე ადრე არ დაბრუნდეს, მაშინაც კი თუ ქსელი მაშინვე წყნარია. */
  minWaitMs?: number;
  /** ხისტი ჭერი — ამის შემდეგ ბრუნდება `timeout`-ით. */
  maxWaitMs?: number;
  /** ამაზე დიდხანს ღია მოთხოვნა აქტიურად აღარ ითვლება (ჩამოკიდებულია). */
  stuckAfterMs?: number;
  /** რამდენი აქტიური მოთხოვნა ჩაითვალოს ჯერ კიდევ „წყნარად". */
  tolerance?: number;
}

export interface NetworkSettleResult {
  /** `true` — ქსელი დამშვიდდა; `false` — ჭერს მივაღწიეთ. */
  settled: boolean;
  reason: "idle" | "timeout";
  waitedMs: number;
  /** age-out-ით ჩამოწერილი მოთხოვნები — დიაგნოსტიკისთვის. */
  stuck: number;
}

const DEFAULTS = {
  idleMs: 500,
  minWaitMs: 1000,
  maxWaitMs: 15000,
  stuckAfterMs: 5000,
  tolerance: 0,
} as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * ელოდება, სანამ გვერდის ქსელური აქტივობა დამშვიდდება — ან სანამ ბიუჯეტი
 * ამოიწურება. **არასდროს აგდებს შეცდომას.**
 */
export async function waitForNetworkSettled(
  page: Page,
  options: NetworkSettleOptions = {},
): Promise<NetworkSettleResult> {
  const idleMs = options.idleMs ?? DEFAULTS.idleMs;
  const minWaitMs = options.minWaitMs ?? DEFAULTS.minWaitMs;
  const maxWaitMs = options.maxWaitMs ?? DEFAULTS.maxWaitMs;
  const stuckAfterMs = options.stuckAfterMs ?? DEFAULTS.stuckAfterMs;
  const tolerance = options.tolerance ?? DEFAULTS.tolerance;

  const startedAt = Date.now();

  // მოთხოვნის ობიექტი -> როდის დაიწყო. იდენტობით ვინახავთ: `requestfinished`
  // და `requestfailed` იმავე ობიექტს აბრუნებენ, რასაც `request`.
  const pending = new Map<unknown, number>();

  const onRequest = (request: unknown): void => {
    pending.set(request, Date.now());
  };
  const onSettledRequest = (request: unknown): void => {
    pending.delete(request);
  };

  // Puppeteer-ის event-ების ტიპები `HTTPRequest`-ზეა მიბმული; აქ მხოლოდ
  // ობიექტის იდენტობა გვჭირდება, ამიტომ handler-ები `unknown`-ს იღებენ.
  const listen = page as unknown as {
    on(event: string, handler: (arg: unknown) => void): unknown;
    off(event: string, handler: (arg: unknown) => void): unknown;
  };

  listen.on("request", onRequest);
  listen.on("requestfinished", onSettledRequest);
  listen.on("requestfailed", onSettledRequest);

  try {
    let quietSince: number | null = null;

    for (;;) {
      const now = Date.now();
      const elapsed = now - startedAt;

      let active = 0;
      let stuck = 0;
      for (const requestStartedAt of pending.values()) {
        if (now - requestStartedAt >= stuckAfterMs) stuck++;
        else active++;
      }

      if (elapsed >= maxWaitMs) {
        return { settled: false, reason: "timeout", waitedMs: elapsed, stuck };
      }

      if (active <= tolerance) {
        if (quietSince === null) quietSince = now;
        if (now - quietSince >= idleMs && elapsed >= minWaitMs) {
          return { settled: true, reason: "idle", waitedMs: elapsed, stuck };
        }
      } else {
        quietSince = null;
      }

      await sleep(POLL_MS);
    }
  } finally {
    listen.off("request", onRequest);
    listen.off("requestfinished", onSettledRequest);
    listen.off("requestfailed", onSettledRequest);
  }
}
