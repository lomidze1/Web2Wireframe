/**
 * CDPClient.on() Tests — Phase 1: StabilizationClient Compatibility
 *
 * TDD: ეს ტესტები წერია იმპლემენტაციამდე.
 * CDPClient-ს უნდა დაემატოს on() მეთოდი, რომელიც:
 * - Puppeteer CDPSession-ის event-ებს მოუსმენს
 * - StabilizationClient ინტერფეისს დააკმაყოფილებს (send + on)
 * - unsubscribe ფუნქციას დააბრუნებს
 *
 * ეს აუცილებელია shared-extraction-ის prepareStabilization()
 * და captureViewportMetrics() ფუნქციების გამოსაყენებლად Plugin_Backend-ში.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";
import { CDPClient } from "../src/lib/cdp/client.js";

// ============================================================================
// MOCK: Puppeteer CDPSession (extends EventEmitter in real Puppeteer)
// ============================================================================

function createMockSession() {
  const emitter = new EventEmitter() as EventEmitter & {
    send: ReturnType<typeof vi.fn>;
    detach: ReturnType<typeof vi.fn>;
  };
  emitter.send = vi.fn().mockResolvedValue({});
  emitter.detach = vi.fn().mockResolvedValue(undefined);
  return emitter;
}

// ============================================================================
// #1: on() მეთოდის არსებობა
// ============================================================================

describe("CDPClient.on() — StabilizationClient compatibility", () => {
  let session: ReturnType<typeof createMockSession>;
  let client: CDPClient;

  beforeEach(() => {
    session = createMockSession();
    client = new CDPClient(session as any);
  });

  it("should have an on() method", () => {
    expect(typeof client.on).toBe("function");
  });

  // ==========================================================================
  // #2: on() აბრუნებს unsubscribe ფუნქციას
  // ==========================================================================

  it("should return an unsubscribe function from on()", () => {
    const callback = vi.fn();
    const unsubscribe = client.on("Page.loadEventFired", callback);

    expect(typeof unsubscribe).toBe("function");
  });

  // ==========================================================================
  // #3: callback გამოიძახება CDP event-ზე
  // ==========================================================================

  it("should invoke callback when CDP event fires", () => {
    const callback = vi.fn();
    client.on("Page.loadEventFired", callback);

    // Puppeteer CDPSession emits events via EventEmitter
    session.emit("Page.loadEventFired", { timestamp: 123.456 });

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith({ timestamp: 123.456 });
  });

  // ==========================================================================
  // #4: მრავალი listener ერთ event-ზე
  // ==========================================================================

  it("should support multiple listeners on the same event", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();

    client.on("Page.loadEventFired", cb1);
    client.on("Page.loadEventFired", cb2);
    client.on("Page.loadEventFired", cb3);

    session.emit("Page.loadEventFired");

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb3).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // #5: unsubscribe მხოლოდ კონკრეტულ listener-ს შლის
  // ==========================================================================

  it("should remove only the specific listener when unsubscribe is called", () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const unsub1 = client.on("Page.loadEventFired", cb1);
    client.on("Page.loadEventFired", cb2);

    unsub1();

    session.emit("Page.loadEventFired");

    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // #6: unsubscribe-ის ორჯერ გამოძახება არ აგდებს შეცდომას
  // ==========================================================================

  it("should not throw when unsubscribe is called multiple times", () => {
    const callback = vi.fn();
    const unsubscribe = client.on("Page.loadEventFired", callback);

    unsubscribe();
    expect(() => unsubscribe()).not.toThrow();
  });

  // ==========================================================================
  // #7: Page.lifecycleEvent params სწორად გადადის
  // ==========================================================================

  it("should pass event params correctly for Page.lifecycleEvent", () => {
    const callback = vi.fn();
    client.on("Page.lifecycleEvent", callback);

    session.emit("Page.lifecycleEvent", {
      name: "networkIdle",
      timestamp: 456.789,
    });

    expect(callback).toHaveBeenCalledWith({
      name: "networkIdle",
      timestamp: 456.789,
    });
  });

  // ==========================================================================
  // #8: სხვადასხვა event-ები ინდეპენდენტურია
  // ==========================================================================

  it("should keep listeners for different events independent", () => {
    const loadCb = vi.fn();
    const lifecycleCb = vi.fn();

    client.on("Page.loadEventFired", loadCb);
    client.on("Page.lifecycleEvent", lifecycleCb);

    session.emit("Page.loadEventFired");

    expect(loadCb).toHaveBeenCalledTimes(1);
    expect(lifecycleCb).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // #9: unsubscribe-ის შემდეგ event არ მოდის
  // ==========================================================================

  it("should not receive events after unsubscribe", () => {
    const callback = vi.fn();
    const unsubscribe = client.on("Page.loadEventFired", callback);

    // First event — should fire
    session.emit("Page.loadEventFired");
    expect(callback).toHaveBeenCalledTimes(1);

    // Unsubscribe
    unsubscribe();

    // Second event — should NOT fire
    session.emit("Page.loadEventFired");
    expect(callback).toHaveBeenCalledTimes(1); // still 1, not 2
  });

  // ==========================================================================
  // #10: StabilizationClient ინტერფეისის სრული კონტრაქტი
  // ==========================================================================

  it("should satisfy full StabilizationClient interface contract", async () => {
    // StabilizationClient requires:
    // send<T>(method: string, params?: Record<string, unknown>): Promise<T>
    // on(event: string, callback: (params?: unknown) => void): () => void

    // 1. send() returns a Promise
    const sendResult = client.send("Test.method", {});
    expect(sendResult).toBeInstanceOf(Promise);
    await sendResult;

    // 2. on() returns a function (unsubscribe)
    const onResult = client.on("Test.event", () => {});
    expect(typeof onResult).toBe("function");
    onResult(); // cleanup
  });

  // ==========================================================================
  // #11: session event listener leak-ის პრევენცია
  // ==========================================================================

  it("should not leak listeners on the underlying session after unsubscribe", () => {
    const callback = vi.fn();
    const unsubscribe = client.on("Page.loadEventFired", callback);

    const countBefore = session.listenerCount("Page.loadEventFired");
    expect(countBefore).toBe(1);

    unsubscribe();

    const countAfter = session.listenerCount("Page.loadEventFired");
    expect(countAfter).toBe(0);
  });

  // ==========================================================================
  // #12: detach()-ის შემდეგ listener-ები იშლება
  // ==========================================================================

  it("should clean up all listeners when client is detached", async () => {
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    client.on("Page.loadEventFired", cb1);
    client.on("Page.lifecycleEvent", cb2);

    expect(session.listenerCount("Page.loadEventFired")).toBe(1);
    expect(session.listenerCount("Page.lifecycleEvent")).toBe(1);

    await client.detach();

    // After detach, no listeners should remain
    expect(session.listenerCount("Page.loadEventFired")).toBe(0);
    expect(session.listenerCount("Page.lifecycleEvent")).toBe(0);
  });

  // ==========================================================================
  // #13: callback-ის გარეშე event — არ ვარდება
  // ==========================================================================

  it("should not throw when event fires with no params", () => {
    const callback = vi.fn();
    client.on("Page.loadEventFired", callback);

    expect(() => session.emit("Page.loadEventFired")).not.toThrow();
    expect(callback).toHaveBeenCalledTimes(1);
    // callback should receive undefined as params
    expect(callback).toHaveBeenCalledWith();
  });
});
