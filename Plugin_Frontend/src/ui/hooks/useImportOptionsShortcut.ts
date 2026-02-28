import { useState, useEffect, useRef } from "preact/hooks";
import { useConfig } from "../shared/ConfigContext";

/**
 * Shared hook that listens for Cmd+R (Mac) / Ctrl+R (Win) to restore
 * the Import Options modal when it's been disabled via "Don't show this again".
 *
 * Returns a toast message string that auto-clears after 3 seconds,
 * plus a key that increments on each press (for CSS animation restart).
 */
export function useImportOptionsShortcut(): {
  shortcutMessage: string | null;
  shortcutKey: number;
} {
  const { config, updateConfig } = useConfig();
  const [shortcutMessage, setShortcutMessage] = useState<string | null>(null);
  const [shortcutKey, setShortcutKey] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timer on unmount only
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "r") {
        e.preventDefault();
        e.stopPropagation();

        // Clear any existing timer
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }

        if (!config.showImportOptions) {
          updateConfig({ showImportOptions: true });
          setShortcutMessage("Import Options Restored");
        } else {
          setShortcutMessage("Import Options is already enabled");
        }

        // Increment key to force re-mount and restart CSS animation
        setShortcutKey((prev) => prev + 1);

        // Auto-dismiss after 3 seconds
        timerRef.current = setTimeout(() => {
          setShortcutMessage(null);
          timerRef.current = null;
        }, 3000);
      }
    };

    document.addEventListener("keydown", handleShortcut, true);
    return () => {
      document.removeEventListener("keydown", handleShortcut, true);
    };
  }, [config.showImportOptions, updateConfig]);

  return { shortcutMessage, shortcutKey };
}
