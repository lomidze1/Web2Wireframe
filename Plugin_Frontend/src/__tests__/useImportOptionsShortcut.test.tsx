import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/preact";
import { useImportOptionsShortcut } from "../ui/hooks/useImportOptionsShortcut";
import { createMockConfigContext } from "./helpers/configMock";

// Mock useConfig while preserving real exports
const mockContext = createMockConfigContext();
vi.mock("../ui/shared/ConfigContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../ui/shared/ConfigContext")>();
  return {
    ...actual,
    useConfig: () => mockContext,
  };
});

describe("useImportOptionsShortcut", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockContext.config = { ...mockContext.config, showImportOptions: true };
    mockContext.updateConfig = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function pressCmdR() {
    const event = new KeyboardEvent("keydown", {
      key: "r",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);
  }

  it("returns null message and key=0 initially", () => {
    const { result } = renderHook(() => useImportOptionsShortcut());
    expect(result.current.shortcutMessage).toBeNull();
    expect(result.current.shortcutKey).toBe(0);
  });

  it("shows 'already enabled' when showImportOptions is true", () => {
    mockContext.config.showImportOptions = true;

    const { result } = renderHook(() => useImportOptionsShortcut());

    act(() => {
      pressCmdR();
    });

    expect(result.current.shortcutMessage).toBe(
      "Import Options is already enabled"
    );
    expect(mockContext.updateConfig).not.toHaveBeenCalled();
  });

  it("shows 'Restored' and calls updateConfig when showImportOptions is false", () => {
    mockContext.config.showImportOptions = false;

    const { result } = renderHook(() => useImportOptionsShortcut());

    act(() => {
      pressCmdR();
    });

    expect(result.current.shortcutMessage).toBe("Import Options Restored");
    expect(mockContext.updateConfig).toHaveBeenCalledWith({
      showImportOptions: true,
    });
  });

  it("increments shortcutKey on each press", () => {
    const { result } = renderHook(() => useImportOptionsShortcut());

    act(() => {
      pressCmdR();
    });
    expect(result.current.shortcutKey).toBe(1);

    act(() => {
      pressCmdR();
    });
    expect(result.current.shortcutKey).toBe(2);
  });

  it("clears message after 3 seconds", () => {
    const { result } = renderHook(() => useImportOptionsShortcut());

    act(() => {
      pressCmdR();
    });
    expect(result.current.shortcutMessage).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.shortcutMessage).toBeNull();
  });

  it("resets timer on repeated press within 3 seconds", () => {
    const { result } = renderHook(() => useImportOptionsShortcut());

    act(() => {
      pressCmdR();
    });
    expect(result.current.shortcutMessage).not.toBeNull();

    // Advance 2 seconds
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.shortcutMessage).not.toBeNull();

    // Press again - timer should reset
    act(() => {
      pressCmdR();
    });

    // 2 more seconds (4 total from first press, 2 from second)
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    // Should still be showing because timer reset
    expect(result.current.shortcutMessage).not.toBeNull();

    // 1 more second (3 total from second press)
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.shortcutMessage).toBeNull();
  });

  it("does not trigger on regular 'r' key without modifier", () => {
    const { result } = renderHook(() => useImportOptionsShortcut());

    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "r",
        metaKey: false,
        ctrlKey: false,
        bubbles: true,
      });
      document.dispatchEvent(event);
    });

    expect(result.current.shortcutMessage).toBeNull();
  });

  it("triggers on Ctrl+R (Windows)", () => {
    const { result } = renderHook(() => useImportOptionsShortcut());

    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "r",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
    });

    expect(result.current.shortcutMessage).not.toBeNull();
  });
});
