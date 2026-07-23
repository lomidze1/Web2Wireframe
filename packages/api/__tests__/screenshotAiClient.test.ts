import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  analyzeScreenshotAbsolute,
  analyzeScreenshotAbsoluteWithRetry,
  _setClient,
} from "../src/lib/aiGenerator.js";

// ============================================================================
// Mock Anthropic client helpers
// ============================================================================

const VALID_ABSOLUTE_JSON = JSON.stringify({
  pageWidth: 1440,
  pageHeight: 900,
  extractedColors: {
    text: "#111111",
    background: "#FFFFFF",
    secondary: "#888888",
    surface: "#F5F5F5",
    accent: "#3366FF",
  },
  elements: [
    { type: "heading", text: "Hello", level: 1, x: 100, y: 80, width: 600, height: 56 },
  ],
});

interface MockResponse {
  stop_reason?: string;
  content: Array<{ type: string; text?: string; thinking?: string }>;
  usage?: Record<string, number>;
}

function textResponse(text: string, stopReason = "end_turn"): MockResponse {
  return {
    stop_reason: stopReason,
    content: [{ type: "text", text }],
    usage: { input_tokens: 100, output_tokens: 200 },
  };
}

/** Build a mock client whose messages.create resolves/rejects per call. */
function mockClient(create: ReturnType<typeof vi.fn>): Anthropic {
  return { messages: { create } } as unknown as Anthropic;
}

const PARAMS = {
  imageBase64: "data:image/png;base64,AAAA",
  imageWidth: 1440,
  imageHeight: 900,
  viewportWidth: 1440,
  textMode: "website",
};

let savedAiModel: string | undefined;

beforeEach(() => {
  savedAiModel = process.env.AI_MODEL;
  delete process.env.AI_MODEL;
});

afterEach(() => {
  if (savedAiModel !== undefined) process.env.AI_MODEL = savedAiModel;
  else delete process.env.AI_MODEL;
  _setClient(null);
});

// ============================================================================
// Model / request parameters
// ============================================================================

describe("analyzeScreenshotAbsolute request parameters", () => {
  it("defaults to claude-sonnet-5 when AI_MODEL is unset", async () => {
    const create = vi.fn().mockResolvedValue(textResponse(VALID_ABSOLUTE_JSON));
    _setClient(mockClient(create));

    await analyzeScreenshotAbsolute(PARAMS);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0].model).toBe("claude-sonnet-5");
  });

  it("respects the AI_MODEL env override", async () => {
    process.env.AI_MODEL = "claude-sonnet-4-20250514";
    const create = vi.fn().mockResolvedValue(textResponse(VALID_ABSOLUTE_JSON));
    _setClient(mockClient(create));

    await analyzeScreenshotAbsolute(PARAMS);
    expect(create.mock.calls[0][0].model).toBe("claude-sonnet-4-20250514");
  });

  it("does not send temperature (rejected with 400 on Sonnet 5)", async () => {
    const create = vi.fn().mockResolvedValue(textResponse(VALID_ABSOLUTE_JSON));
    _setClient(mockClient(create));

    await analyzeScreenshotAbsolute(PARAMS);
    expect(create.mock.calls[0][0]).not.toHaveProperty("temperature");
  });

  it("sends max_tokens 24000 (headroom for dense screenshots + thinking)", async () => {
    const create = vi.fn().mockResolvedValue(textResponse(VALID_ABSOLUTE_JSON));
    _setClient(mockClient(create));

    await analyzeScreenshotAbsolute(PARAMS);
    expect(create.mock.calls[0][0].max_tokens).toBe(24000);
  });
});

// ============================================================================
// Thinking blocks (Sonnet 5 runs adaptive thinking when `thinking` is omitted)
// ============================================================================

describe("thinking-block handling", () => {
  it("parses the first text block even when a thinking block precedes it", async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: "end_turn",
      content: [
        { type: "thinking", thinking: "" },
        { type: "text", text: VALID_ABSOLUTE_JSON },
      ],
      usage: { input_tokens: 100, output_tokens: 200 },
    });
    _setClient(mockClient(create));

    const result = await analyzeScreenshotAbsolute(PARAMS);
    expect(result.elements).toHaveLength(1);
    expect(result.pageWidth).toBe(1440);
  });

  it("throws when the response has no text block at all", async () => {
    const create = vi.fn().mockResolvedValue({
      stop_reason: "end_turn",
      content: [{ type: "thinking", thinking: "" }],
      usage: {},
    });
    _setClient(mockClient(create));

    await expect(analyzeScreenshotAbsolute(PARAMS)).rejects.toThrow(/text/i);
  });
});

// ============================================================================
// Truncation detection
// ============================================================================

describe("truncation detection", () => {
  it("throws a TRUNCATED-coded error on stop_reason max_tokens", async () => {
    const create = vi
      .fn()
      .mockResolvedValue(textResponse('{"pageWidth": 1440, "elements": [', "max_tokens"));
    _setClient(mockClient(create));

    await expect(analyzeScreenshotAbsolute(PARAMS)).rejects.toMatchObject({
      code: "TRUNCATED",
    });
  });

  it("retry wrapper does not blindly retry a truncated response", async () => {
    const create = vi
      .fn()
      .mockResolvedValue(textResponse('{"pageWidth": 1440', "max_tokens"));
    _setClient(mockClient(create));

    await expect(analyzeScreenshotAbsoluteWithRetry(PARAMS)).rejects.toMatchObject({
      code: "TRUNCATED",
    });
    // Truncation is deterministic for the same input — a second identical
    // call would truncate again, so the wrapper must short-circuit.
    expect(create).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
// Retry with validation feedback
// ============================================================================

describe("analyzeScreenshotAbsoluteWithRetry feedback", () => {
  it("feeds validation errors back to the model on the retry attempt", async () => {
    // An unknown element type stays invalid even after post-processing
    // (missing bboxes get coerced to 0 by postProcessAbsoluteResult).
    const invalid = JSON.stringify({
      elements: [{ type: "mystery-widget", x: 0, y: 0, width: 100, height: 40 }],
    });
    const create = vi
      .fn()
      .mockResolvedValueOnce(textResponse(invalid))
      .mockResolvedValueOnce(textResponse(VALID_ABSOLUTE_JSON));
    _setClient(mockClient(create));

    const result = await analyzeScreenshotAbsoluteWithRetry(PARAMS);
    expect(result.elements).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(2);

    // Second call's user prompt must contain the previous validation errors.
    const secondCall = create.mock.calls[1][0];
    const textBlock = secondCall.messages[0].content.find(
      (b: { type: string }) => b.type === "text",
    );
    expect(textBlock.text).toContain("Previous attempt failed validation");
    expect(textBlock.text).toContain("mystery-widget");
  });

  it("first attempt prompt contains no feedback section", async () => {
    const create = vi.fn().mockResolvedValue(textResponse(VALID_ABSOLUTE_JSON));
    _setClient(mockClient(create));

    await analyzeScreenshotAbsoluteWithRetry(PARAMS);
    const firstCall = create.mock.calls[0][0];
    const textBlock = firstCall.messages[0].content.find(
      (b: { type: string }) => b.type === "text",
    );
    expect(textBlock.text).not.toContain("Previous attempt failed validation");
  });

  it("still short-circuits on 401/403 auth errors without retrying", async () => {
    const authErr = Object.assign(new Error("auth"), { status: 401 });
    const create = vi.fn().mockRejectedValue(authErr);
    _setClient(mockClient(create));

    await expect(analyzeScreenshotAbsoluteWithRetry(PARAMS)).rejects.toMatchObject({
      status: 401,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
