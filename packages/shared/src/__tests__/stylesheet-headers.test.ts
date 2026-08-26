/**
 * collectStyleSheetHeaders() Tests
 *
 * TDD: ეს ტესტები წერია იმპლემენტაციამდე.
 *
 * კონტექსტი — რატომ არსებობს:
 *
 * @font-face-ის ამოღება resource graph-ის stylesheet-ებზე იყო აგებული
 * (`Page.getResourceTree` → `Page.getResourceContent`). ბევრ საიტზე ეს გზა
 * ცარიელია — stripe.com-ზე გაზომილი:
 *
 *   resource graph stylesheets = 0  → @font-face = 0  → ფონტების ZIP ცარიელი
 *   CSS.getStyleSheetText      = 6  → @font-face = 3
 *
 * CSS domain ყველა stylesheet-ს ხედავს (inline `<style>`-საც და
 * cross-origin-საც), ამიტომ სწორი წყარო `CSS.styleSheetAdded`-ია.
 * იგივე ხერხი უკვე მუშაობს browser-extension-ში (background/cdp/fonts.ts).
 */

import { describe, it, expect, vi } from "vitest";
import { collectStyleSheetHeaders } from "../css";
import type { CDPClientInterface } from "../types";

type CDPEventCallback = (params?: unknown) => void;

// ============================================================================
// Mock CDP client
// ============================================================================

interface MockOptions {
  /** `CSS.enable`-ზე გამოსაშვები header-ები. */
  headersOnEnable?: Array<{ styleSheetId: string; sourceURL: string }>;
  /** `on()` საერთოდ არ არსებობდეს (არჩევითი წევრია ინტერფეისში). */
  withoutOn?: boolean;
}

function makeMockClient(options: MockOptions = {}): {
  client: CDPClientInterface;
  calls: string[];
  activeListeners: () => number;
} {
  const { headersOnEnable = [], withoutOn = false } = options;
  const calls: string[] = [];
  const listeners = new Map<string, Set<CDPEventCallback>>();

  const emit = (event: string, params: unknown): void => {
    for (const cb of listeners.get(event) ?? []) cb(params);
  };

  const client: CDPClientInterface = {
    send: vi.fn(async (method: string) => {
      calls.push(method);
      if (method === "CSS.enable") {
        // ნამდვილი CDP ყველა არსებულ sheet-ს ხელახლა აანონსებს
        for (const header of headersOnEnable) emit("CSS.styleSheetAdded", { header });
      }
      return {};
    }) as CDPClientInterface["send"],
    enableDomains: vi.fn(async () => {}),
  };

  if (!withoutOn) {
    client.on = (event: string, callback: CDPEventCallback): (() => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(callback);
      return () => {
        listeners.get(event)?.delete(callback);
      };
    };
  }

  return {
    client,
    calls,
    activeListeners: () =>
      [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
  };
}

// ============================================================================
// TESTS
// ============================================================================

describe("collectStyleSheetHeaders", () => {
  it("აბრუნებს ყველა stylesheet-ის header-ს", async () => {
    const { client } = makeMockClient({
      headersOnEnable: [
        { styleSheetId: "sheet-1", sourceURL: "https://example.com/a.css" },
        { styleSheetId: "sheet-2", sourceURL: "https://cdn.other.com/b.css" },
      ],
    });

    const headers = await collectStyleSheetHeaders(client, 0);

    expect(headers).toEqual([
      { styleSheetId: "sheet-1", sourceURL: "https://example.com/a.css" },
      { styleSheetId: "sheet-2", sourceURL: "https://cdn.other.com/b.css" },
    ]);
  });

  it("CSS domain-ს გადატვირთავს, რომ არსებული sheet-ებიც აანონსდეს", async () => {
    const { client, calls } = makeMockClient({
      headersOnEnable: [{ styleSheetId: "s", sourceURL: "" }],
    });

    await collectStyleSheetHeaders(client, 0);

    // disable → enable თანმიმდევრობა კრიტიკულია: enable-ის გარეშე უკვე
    // დამატებული sheet-ები აღარ აანონსდება.
    expect(calls.filter((c) => c.startsWith("CSS."))).toEqual([
      "CSS.disable",
      "CSS.enable",
    ]);
  });

  it("sourceURL-ის გარეშე header-საც იტანს (inline <style>)", async () => {
    const { client } = makeMockClient({
      headersOnEnable: [{ styleSheetId: "inline-1", sourceURL: "" }],
    });

    const headers = await collectStyleSheetHeaders(client, 0);

    expect(headers).toEqual([{ styleSheetId: "inline-1", sourceURL: "" }]);
  });

  it("listener-ს ხსნის დასრულებისას", async () => {
    const { client, activeListeners } = makeMockClient({
      headersOnEnable: [{ styleSheetId: "s", sourceURL: "" }],
    });

    await collectStyleSheetHeaders(client, 0);

    expect(activeListeners()).toBe(0);
  });

  it("`on()`-ის გარეშე client-ზე ცარიელს აბრუნებს და არ ვარდება", async () => {
    const { client } = makeMockClient({ withoutOn: true });

    await expect(collectStyleSheetHeaders(client, 0)).resolves.toEqual([]);
  });

  it("CDP-ს შეცდომაზე ცარიელს აბრუნებს და არ ვარდება", async () => {
    const client: CDPClientInterface = {
      send: vi.fn(async () => {
        throw new Error("CSS.disable failed");
      }) as CDPClientInterface["send"],
      enableDomains: vi.fn(async () => {}),
      on: () => () => {},
    };

    await expect(collectStyleSheetHeaders(client, 0)).resolves.toEqual([]);
  });
});
