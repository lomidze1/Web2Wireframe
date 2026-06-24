import { describe, it, expect, vi, afterEach } from "vitest";
import { ImportEvent, logImportEvent } from "../src/models/ImportEvent.js";

describe("logImportEvent — best-effort", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes one row via ImportEvent.create", async () => {
    const createSpy = vi.spyOn(ImportEvent, "create").mockResolvedValue({} as never);

    await logImportEvent({
      figmaUserId: "u1",
      sourceUrl: "https://acme.test",
      type: "extension",
      viewports: [1440],
      success: true,
    });

    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0][0]).toMatchObject({
      figmaUserId: "u1",
      sourceUrl: "https://acme.test",
      type: "extension",
      success: true,
    });
  });

  it("does not throw when the DB write fails", async () => {
    vi.spyOn(ImportEvent, "create").mockRejectedValue(new Error("db down"));

    await expect(
      logImportEvent({
        figmaUserId: "u1",
        sourceUrl: "https://acme.test",
        type: "url",
        viewports: [1440],
        success: false,
        errorCode: "TIMEOUT",
      }),
    ).resolves.toBeUndefined();
  });
});
