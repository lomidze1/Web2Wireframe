/**
 * waitForNetworkSettled() Tests
 *
 * TDD: ეს ტესტები წერია იმპლემენტაციამდე.
 *
 * კონტექსტი — რატომ არსებობს ეს helper:
 *
 * `installNavigationSsrfGuard()` რთავს `page.setRequestInterception(true)`-ს.
 * მისი ჩართვისას ზოგიერთი მოთხოვნა Puppeteer-ის მრიცხველში სამუდამოდ
 * ჩამოკიდებული რჩება — არც `requestfinished`, არც `requestfailed`. stripe.com-ზე
 * ასეთი ზუსტად 2-ია (Web Worker სკრიპტი + doubleclick beacon), ამიტომ
 * `waitUntil: "networkidle0"` (0 აქტიური) არასდროს სრულდება და `goto` 60 წამზე
 * ვარდება → იმპორტი ჩავარდება.
 *
 * ეს helper იმავე ლოდინს აკეთებს, ოღონდ ჩვენი წესებით:
 *   - age-out: `stuckAfterMs`-ზე ძველი მოთხოვნა აქტიურად აღარ ითვლება
 *   - ხისტი ჭერი: `maxWaitMs`-ზე ბრუნდება, throw-ის გარეშე
 *   - იატაკი: `minWaitMs`-ზე ადრე არასდროს ბრუნდება
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "events";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "puppeteer";
import { waitForNetworkSettled } from "../src/lib/cdp/network-settle.js";

// ============================================================================
// HELPERS
// ============================================================================

/** Puppeteer Page-ის მინიმალური მოდელი: მხოლოდ request-ის event-ები. */
function createMockPage(): EventEmitter {
  return new EventEmitter();
}

/** უნიკალური „მოთხოვნის" ობიექტი — helper იდენტობით ინახავს. */
function createRequest(url: string): { url: () => string } {
  return { url: () => url };
}

const asPage = (e: EventEmitter): Page => e as unknown as Page;

afterEach(() => {
  vi.useRealTimers();
});

// ============================================================================
// TESTS
// ============================================================================

describe("waitForNetworkSettled", () => {
  it("ცარიელ გვერდზე ბრუნდება idle-ით, მაგრამ არა minWaitMs-ზე ადრე", async () => {
    vi.useFakeTimers();
    const page = createMockPage();

    const promise = waitForNetworkSettled(asPage(page), {
      idleMs: 500,
      minWaitMs: 1000,
      maxWaitMs: 10000,
    });
    let resolved = false;
    void promise.then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(800);
    expect(resolved).toBe(false); // იატაკი ჯერ არ ამოწურულა

    await vi.advanceTimersByTimeAsync(400);
    const result = await promise;

    expect(result.settled).toBe(true);
    expect(result.reason).toBe("idle");
    expect(result.waitedMs).toBeGreaterThanOrEqual(1000);
    expect(result.stuck).toBe(0);
  });

  it("ელოდება აქტიურ მოთხოვნებს და მათი დასრულების შემდეგ ბრუნდება", async () => {
    vi.useFakeTimers();
    const page = createMockPage();

    const promise = waitForNetworkSettled(asPage(page), {
      idleMs: 500,
      minWaitMs: 500,
      maxWaitMs: 20000,
      stuckAfterMs: 10000,
    });
    let resolved = false;
    void promise.then(() => {
      resolved = true;
    });

    const req1 = createRequest("https://example.com/a.js");
    const req2 = createRequest("https://example.com/b.css");
    page.emit("request", req1);
    page.emit("request", req2);

    await vi.advanceTimersByTimeAsync(3000);
    expect(resolved).toBe(false); // ორივე ჯერ ღიაა

    page.emit("requestfinished", req1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(resolved).toBe(false); // ერთი ისევ ღიაა

    page.emit("requestfailed", req2);
    await vi.advanceTimersByTimeAsync(700);

    const result = await promise;
    expect(result.settled).toBe(true);
    expect(result.reason).toBe("idle");
    expect(result.stuck).toBe(0);
  });

  it("stripe.com-ის რეპროდუქცია: სამუდამოდ ჩამოკიდებული 2 მოთხოვნა არ ბლოკავს", async () => {
    vi.useFakeTimers();
    const page = createMockPage();

    const promise = waitForNetworkSettled(asPage(page), {
      idleMs: 500,
      minWaitMs: 500,
      maxWaitMs: 30000,
      stuckAfterMs: 5000,
    });

    // ეს ორი არასდროს დასრულდება — ზუსტად ისე, როგორც რეალურ stripe.com-ზე
    page.emit("request", createRequest("https://stripe.com/_workers/dotGeneration.worker.js"));
    page.emit("request", createRequest("https://ad.doubleclick.net/activity;src=10460294"));

    // ჯანსაღი მოთხოვნაც, რომელიც ნორმალურად სრულდება
    const healthy = createRequest("https://stripe.com/main.css");
    page.emit("request", healthy);
    page.emit("requestfinished", healthy);

    await vi.advanceTimersByTimeAsync(6000);
    const result = await promise;

    expect(result.settled).toBe(true);
    expect(result.reason).toBe("idle"); // age-out-ის შემდეგ წყნარადაა
    expect(result.stuck).toBe(2);
    expect(result.waitedMs).toBeLessThan(30000); // ჭერამდე მივიდა? — არა
  });

  it("უწყვეტი ტრაფიკის დროს ბრუნდება maxWaitMs-ზე timeout-ით და არ აგდებს შეცდომას", async () => {
    vi.useFakeTimers();
    const page = createMockPage();

    const promise = waitForNetworkSettled(asPage(page), {
      idleMs: 500,
      minWaitMs: 500,
      maxWaitMs: 5000,
      stuckAfterMs: 10000,
    });

    // ყოველ 200ms-ში ახალი მოთხოვნა — აქტიური არასდროს ეცემა ნულამდე
    for (let i = 0; i < 40; i++) {
      page.emit("request", createRequest(`https://example.com/chunk-${i}.js`));
      await vi.advanceTimersByTimeAsync(200);
    }

    const result = await promise;
    expect(result.settled).toBe(false);
    expect(result.reason).toBe("timeout");
    expect(result.waitedMs).toBeGreaterThanOrEqual(5000);
  });

  it("tolerance-ს პატივს სცემს — დაშვებული რაოდენობის აქტიური არ ბლოკავს", async () => {
    vi.useFakeTimers();
    const page = createMockPage();

    const promise = waitForNetworkSettled(asPage(page), {
      idleMs: 500,
      minWaitMs: 500,
      maxWaitMs: 10000,
      stuckAfterMs: 60000, // age-out შორსაა — მხოლოდ tolerance წყვეტს
      tolerance: 2,
    });

    page.emit("request", createRequest("https://example.com/poll-1"));
    page.emit("request", createRequest("https://example.com/poll-2"));

    await vi.advanceTimersByTimeAsync(1500);
    const result = await promise;

    expect(result.settled).toBe(true);
    expect(result.reason).toBe("idle");
  });

  it("გამოსვლისას ყველა listener-ს ხსნის (leak არ რჩება)", async () => {
    vi.useFakeTimers();
    const page = createMockPage();

    const promise = waitForNetworkSettled(asPage(page), {
      idleMs: 200,
      minWaitMs: 200,
      maxWaitMs: 5000,
    });

    expect(page.listenerCount("request")).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);
    await promise;

    expect(page.listenerCount("request")).toBe(0);
    expect(page.listenerCount("requestfinished")).toBe(0);
    expect(page.listenerCount("requestfailed")).toBe(0);
  });
});

// ============================================================================
// REGRESSION GUARD
// ============================================================================

describe("networkidle0 regression guard", () => {
  it("packages/api/src-ში `networkidle0` აღარსად რჩება", () => {
    const offenders: string[] = [];

    // `network-settle.ts` თავად ხსნის, რატომ აიკრძალა — მისი დოკ-კომენტარი
    // ლეგიტიმურად ახსენებს ტერმინს.
    const DOCUMENTS_THE_BAN = "network-settle.ts";

    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (
          entry.name.endsWith(".ts") &&
          entry.name !== DOCUMENTS_THE_BAN &&
          readFileSync(full, "utf8").includes("networkidle0")
        ) {
          offenders.push(full);
        }
      }
    };
    walk(join(process.cwd(), "src"));

    // `networkidle0` interception-თან ერთად deadlock-ს იწვევს ნებისმიერ საიტზე,
    // რომელსაც მუდმივად დაკიდებული მოთხოვნა აქვს — იხ. waitForNetworkSettled.
    expect(offenders).toEqual([]);
  });
});
