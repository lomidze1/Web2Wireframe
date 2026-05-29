import { describe, it, expect } from "vitest";
import { assertString, assertStringMax } from "../src/lib/validators.js";

describe("assertString", () => {
  it("passes for non-empty strings", () => {
    expect(() => assertString("hello", "field")).not.toThrow();
    expect(() => assertString("a", "field")).not.toThrow();
  });

  it("rejects empty string", () => {
    expect(() => assertString("", "field")).toThrow(/field must be a non-empty string/);
  });

  it("rejects null and undefined", () => {
    expect(() => assertString(null, "field")).toThrow(/field must be a non-empty string/);
    expect(() => assertString(undefined, "field")).toThrow(/field must be a non-empty string/);
  });

  it("rejects numbers", () => {
    expect(() => assertString(42, "field")).toThrow(/field must be a non-empty string/);
    expect(() => assertString(0, "field")).toThrow(/field must be a non-empty string/);
  });

  it("rejects booleans", () => {
    expect(() => assertString(true, "field")).toThrow(/field must be a non-empty string/);
    expect(() => assertString(false, "field")).toThrow(/field must be a non-empty string/);
  });

  it("rejects arrays (NoSQL operator injection vector)", () => {
    expect(() => assertString(["a", "b"], "field")).toThrow(/field must be a non-empty string/);
  });

  it("rejects plain objects (NoSQL operator injection vector)", () => {
    expect(() => assertString({ $ne: null }, "field")).toThrow(/field must be a non-empty string/);
    expect(() => assertString({}, "field")).toThrow(/field must be a non-empty string/);
  });

  it("includes the supplied name in error messages", () => {
    expect(() => assertString({}, "figmaUserId")).toThrow(/figmaUserId/);
    expect(() => assertString({}, "email")).toThrow(/email/);
  });
});

describe("assertStringMax", () => {
  it("passes for strings within the cap", () => {
    expect(() => assertStringMax("short", "field", 64)).not.toThrow();
    expect(() => assertStringMax("a".repeat(64), "field", 64)).not.toThrow();
  });

  it("rejects strings exceeding the cap", () => {
    expect(() => assertStringMax("a".repeat(65), "field", 64)).toThrow(/exceeds max length 64/);
    expect(() => assertStringMax("a".repeat(1024 * 1024), "figmaUserId", 64)).toThrow(/exceeds max length 64/);
  });

  it("delegates non-string rejections to assertString", () => {
    expect(() => assertStringMax({ $ne: null }, "field", 64)).toThrow(/field must be a non-empty string/);
    expect(() => assertStringMax(undefined, "field", 64)).toThrow(/field must be a non-empty string/);
    expect(() => assertStringMax("", "field", 64)).toThrow(/field must be a non-empty string/);
  });

  it("includes the cap value in error messages", () => {
    expect(() => assertStringMax("x".repeat(100), "f", 64)).toThrow(/64/);
  });
});
