import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mock the License model BEFORE importing the service (same pattern as
// license-service.test.ts)
// ============================================================================

const mockFindOne = vi.fn();
const mockFindOneAndUpdate = vi.fn();
const mockCreate = vi.fn();
const mockUpdateOne = vi.fn();

vi.mock("../src/models/License.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/models/License.js")>();
  return {
    ...actual,
    License: {
      findOne: (...args: unknown[]) => mockFindOne(...args),
      findOneAndUpdate: (...args: unknown[]) => mockFindOneAndUpdate(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      updateOne: (...args: unknown[]) => mockUpdateOne(...args),
    },
  };
});

vi.mock("../src/models/LicenseAudit.js", () => ({
  LicenseAudit: {
    create: vi.fn().mockResolvedValue({}),
  },
}));

const { licenseService } = await import("../src/services/licenseService.js");

beforeEach(() => {
  mockFindOneAndUpdate.mockReset();
});

describe("licenseService.refundImport", () => {
  it("atomically decrements usage.imports guarded by $gt: 0", async () => {
    mockFindOneAndUpdate.mockResolvedValue({ usage: { imports: 4 } });

    await licenseService.refundImport("user-123");

    expect(mockFindOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update] = mockFindOneAndUpdate.mock.calls[0];
    expect(filter).toEqual({ figmaUserId: "user-123", "usage.imports": { $gt: 0 } });
    expect(update).toEqual({ $inc: { "usage.imports": -1 } });
  });

  it("is a no-op (no throw) when the counter is already 0", async () => {
    // Guard doesn't match → mongoose returns null; must not throw.
    mockFindOneAndUpdate.mockResolvedValue(null);
    await expect(licenseService.refundImport("user-123")).resolves.toBeUndefined();
  });

  it("rejects a non-string figmaUserId", async () => {
    await expect(
      licenseService.refundImport(undefined as unknown as string),
    ).rejects.toThrow();
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
