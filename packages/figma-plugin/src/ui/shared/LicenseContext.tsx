/** @jsx h */
import { h, createContext } from "preact";
import type { ComponentChildren } from "preact";
import { useState, useEffect, useContext, useCallback, useRef } from "preact/hooks";
import { fetchMyLicense, type License } from "./licenseClient";
import { useConfig } from "./ConfigContext";
import { onQuotaExceeded } from "./quotaEvents";

interface LicenseContextValue {
  license: License | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const LicenseCtx = createContext<LicenseContextValue>({
  license: null,
  isLoading: false,
  error: null,
  refresh: async () => {},
});

export function LicenseProvider({ children }: { children: ComponentChildren }) {
  const { config } = useConfig();
  const figmaUserId = config.figmaUserId;

  const [license, setLicense] = useState<License | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // AbortController for the most recent in-flight fetch, so a fast refresh()
  // call doesn't get its result clobbered by a stale earlier fetch.
  const inFlightRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!figmaUserId) return;
    if (inFlightRef.current) inFlightRef.current.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const fresh = await fetchMyLicense(figmaUserId, controller.signal);
      if (!controller.signal.aborted) setLicense(fresh);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to load license");
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  }, [figmaUserId]);

  // Preload on figmaUserId availability — fires once during plugin startup
  // so the Plan modal opens with cached data instantly.
  useEffect(() => {
    if (!figmaUserId) return;
    void refresh();
    return () => {
      inFlightRef.current?.abort();
      inFlightRef.current = null;
    };
  }, [figmaUserId, refresh]);

  // Server-side quota gate also signals via this event when an import is
  // blocked. Refresh so the footer pill reflects the just-hit limit.
  useEffect(() => {
    return onQuotaExceeded(() => {
      void refresh();
    });
  }, [refresh]);

  return (
    <LicenseCtx.Provider value={{ license, isLoading, error, refresh }}>
      {children}
    </LicenseCtx.Provider>
  );
}

export function useLicense(): LicenseContextValue {
  return useContext(LicenseCtx);
}
