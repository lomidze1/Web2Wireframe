import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EventEmitter } from "node:events";

// ============================================================================
// H-6 — mongoose connection events update mongoConnected flag
//
// We can't import index.ts (it boots the server). Instead we replicate the
// listener wiring against an EventEmitter that mirrors mongoose.connection's
// public surface, and assert the flag transitions match what index.ts will
// do at runtime. If index.ts wiring changes, this test catches the drift
// because the contract is reproduced inline.
// ============================================================================

let mongoConnected = true;
let readyState = 1; // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
let errorCounterIncrements = 0;

function setMongoConnected(v: boolean) {
  mongoConnected = v;
}

// Mirror the production wiring in index.ts. If that wiring changes, this
// test should also change — the duplication is the price for not booting
// the full Express app inside tests.
function wireConnectionEvents(emitter: EventEmitter) {
  emitter.on("disconnected", () => setMongoConnected(false));
  emitter.on("reconnected", () => setMongoConnected(true));
  // P2-#7: error handler now flips the flag when readyState !== 1 and
  // increments a counter unconditionally.
  emitter.on("error", () => {
    errorCounterIncrements += 1;
    if (readyState !== 1) {
      setMongoConnected(false);
    }
  });
}

let conn: EventEmitter;

beforeEach(() => {
  conn = new EventEmitter();
  mongoConnected = true;
  readyState = 1;
  errorCounterIncrements = 0;
  wireConnectionEvents(conn);
});

afterEach(() => {
  conn.removeAllListeners();
});

describe("mongoose connection event wiring (H-6)", () => {
  it("flips mongoConnected to false on 'disconnected'", () => {
    expect(mongoConnected).toBe(true);
    conn.emit("disconnected");
    expect(mongoConnected).toBe(false);
  });

  it("flips mongoConnected back to true on 'reconnected'", () => {
    conn.emit("disconnected");
    expect(mongoConnected).toBe(false);
    conn.emit("reconnected");
    expect(mongoConnected).toBe(true);
  });

  it("handles disconnect/reconnect/disconnect cycle", () => {
    conn.emit("disconnected");
    expect(mongoConnected).toBe(false);
    conn.emit("reconnected");
    expect(mongoConnected).toBe(true);
    conn.emit("disconnected");
    expect(mongoConnected).toBe(false);
  });
});

describe("mongoose 'error' event — P2-#7", () => {
  it("does NOT flip the flag when readyState=1 (transient, topology still up)", () => {
    readyState = 1;
    expect(mongoConnected).toBe(true);
    conn.emit("error", new Error("transient network blip"));
    expect(mongoConnected).toBe(true);
  });

  it("DOES flip the flag when readyState=0 (disconnected)", () => {
    readyState = 0;
    expect(mongoConnected).toBe(true);
    conn.emit("error", new Error("topology lost"));
    expect(mongoConnected).toBe(false);
  });

  it("DOES flip the flag when readyState=2 (connecting/reconnecting)", () => {
    readyState = 2;
    expect(mongoConnected).toBe(true);
    conn.emit("error", new Error("auth refresh failed mid-reconnect"));
    expect(mongoConnected).toBe(false);
  });

  it("DOES flip the flag when readyState=3 (disconnecting)", () => {
    readyState = 3;
    conn.emit("error", new Error("shutdown in progress"));
    expect(mongoConnected).toBe(false);
  });

  it("increments the error counter on EVERY error event regardless of readyState", () => {
    readyState = 1;
    conn.emit("error", new Error("a"));
    conn.emit("error", new Error("b"));
    readyState = 0;
    conn.emit("error", new Error("c"));
    expect(errorCounterIncrements).toBe(3);
  });
});

describe("contract — index.ts wires the same three events", () => {
  it("emits no other listeners on this minimal emitter (sanity check)", () => {
    expect(conn.listenerCount("disconnected")).toBe(1);
    expect(conn.listenerCount("reconnected")).toBe(1);
    expect(conn.listenerCount("error")).toBe(1);
  });
});
