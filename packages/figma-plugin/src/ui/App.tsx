/** @jsx h */
import { h, Fragment } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";

// Import sub-pages
import Web from "./pages/import/web";
import Screenshot from "./pages/import/screenshot";
import HTML from "./pages/import/html";
import AreaSelection from "./pages/import/areaSelection";

// Modals
import Settings from "./components/modalPopup/Settings";
import Help from "./components/modalPopup/Help";
import ExtensionModal from "./components/modalPopup/ExtensionModal";
import RebindFontsModal, {
  type RebindResultInfo,
} from "./components/modalPopup/RebindFontsModal";
import Plan from "./components/modalPopup/planPopup/Plan";
import QuotaExceededModal from "./components/modalPopup/QuotaExceededModal";
import ExpiringSoonModal from "./components/modalPopup/ExpiringSoonModal";
import ImportReportModal, {
  type ReportSource,
} from "./components/modalPopup/ImportReportModal";
import type { ImportWarning } from "../types";

import ConnectFigma from "./components/ConnectFigma";
import {
  applyAuthToken,
  clearAuthToken,
  refreshAuthToken,
} from "./shared/licenseClient";
import { API_BASE_URL } from "./shared/apiConfig";
import { hasTransparentPixel } from "./shared/imageAlpha";
import { mayHaveAlpha } from "./shared/figmaImageConvert";
import { fitWithinFigmaLimit } from "../utils/figmaImageLimit";

import { onQuotaExceeded } from "./shared/quotaEvents";
import { onImportTabRequest } from "./shared/importTabEvents";
import { onAuthExpired } from "./shared/authEvents";

// Components
import Footer from "./components/footer";
import SubHeader from "./components/subHeader";

// Import Config Context
import {
  ConfigProvider,
  useConfig,
  SettingsPanel,
} from "./shared/ConfigContext";
import { LicenseProvider, useLicense } from "./shared/LicenseContext";

// Import global and base styles
import styles from "./styles/ui.css";
import importStyles from "./pages/import/Import.css";

type ImportTab = "web" | "screenshot" | "html" | "area";

export default function App() {
  return (
    <ConfigProvider>
      <ConnectionGate />
    </ConfigProvider>
  );
}

type ConnState = "loading" | "connected" | "disconnected";

/**
 * Gates the app behind a verified Figma OAuth token. On start it loads any
 * persisted token from clientStorage; without a valid one it shows the
 * Connect screen so the backend can verify identity before issuing a token.
 */
function ConnectionGate() {
  const [conn, setConn] = useState<ConnState>("loading");

  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg || msg.type !== "auth-token-loaded") return;
      const stored = msg.data as
        | { token?: string; expiresAt?: number }
        | null;
      if (
        !stored ||
        typeof stored.token !== "string" ||
        typeof stored.expiresAt !== "number" ||
        stored.expiresAt - 60_000 <= Date.now()
      ) {
        setConn("disconnected");
        return;
      }
      // Local timestamp says the token is still fresh — but the backend may
      // reject it anyway (AUTH_SECRET rotated, server-side revoke, schema
      // change). Verify with a cheap /api/auth/me probe before trusting it.
      // On a verified 401 we clear the stale token so the next render shows
      // ConnectFigma; on network errors we keep the token and let downstream
      // API calls surface the problem (don't lock the user out if the API is
      // momentarily unreachable).
      applyAuthToken(stored.token, stored.expiresAt);
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, {
          headers: { Authorization: `Bearer ${stored.token}` },
        });
        if (res.status === 401) {
          clearAuthToken();
          setConn("disconnected");
          return;
        }
        setConn("connected");
        // Roll the long-lived token's expiry in the background.
        void refreshAuthToken();
      } catch {
        // Network failure — trust the local token for now; if it really is
        // bad, the next user-driven API call will surface it.
        setConn("connected");
        void refreshAuthToken();
      }
    };
    window.addEventListener("message", handler);
    parent.postMessage({ pluginMessage: { type: "load-auth-token" } }, "*");
    return () => window.removeEventListener("message", handler);
  }, []);

  // Centralized 401 recovery: any API call (license fetch, import, checkout)
  // that returns 401 dispatches w2w:auth-expired via shared/authEvents.ts.
  // Here we clear the stale token and flip to disconnected so the user lands
  // back on ConnectFigma instead of a "Session expired" / "Invalid signature"
  // dead-end inside whatever modal or import page was active.
  useEffect(() => {
    return onAuthExpired(() => {
      clearAuthToken();
      setConn("disconnected");
    });
  }, []);

  if (conn === "loading") {
    return <div class={styles.loadingScreen}>Loading…</div>;
  }
  if (conn === "disconnected") {
    return <ConnectFigma onConnected={() => setConn("connected")} />;
  }
  // LicenseProvider preloads the user's license during plugin startup so the
  // Plan modal (and footer pill) render with cached data immediately. Mounted
  // here — after Connect succeeded — so figmaUserId is reliably present.
  return (
    <LicenseProvider>
      <AppContent />
    </LicenseProvider>
  );
}

function AppContent() {
  const [importTab, setImportTab] = useState<ImportTab>("web");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsPanel, setSettingsPanel] =
    useState<SettingsPanel>("configuration");
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isExtensionOpen, setIsExtensionOpen] = useState(false);
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [isQuotaExceededOpen, setIsQuotaExceededOpen] = useState(false);
  // Number of text nodes on the current page still carrying the
  // `w2w_original_font` marker (imported with a substituted font, awaiting
  // re-apply). Drives the conditional "Re-apply fonts" footer button — it only
  // appears when there's actually something to re-apply. The sandbox owns the
  // count: it pushes `rebindable-count` on request, after each import, after a
  // rebind, and on Figma page change.
  const [rebindableCount, setRebindableCount] = useState(0);
  // Families still awaiting re-apply (marker values) — shown in the
  // RebindFontsModal so the user knows exactly what to install.
  const [rebindableFamilies, setRebindableFamilies] = useState<string[]>([]);
  // How many of the page's rebindable text nodes fall inside the current Figma
  // selection. Drives the footer button's scoped "Re-apply to selection" label;
  // the sandbox's rebind action already honours the same selection-or-page scope.
  const [selectionRebindableCount, setSelectionRebindableCount] = useState(0);
  /** Whether anything is selected on canvas, pending or not — lets the modal
   *  say "your selection is already clean" instead of silently widening. */
  const [selectionActive, setSelectionActive] = useState(false);
  /** Families this Figma can offer, for the modal's per-font picker. */
  const [installedFontFamilies, setInstalledFontFamilies] = useState<string[]>([]);
  /** The user's substitutions: pending family → chosen family. */
  const [fontChoices, setFontChoices] = useState<Record<string, string>>({});
  // Page-wide total, kept alongside the scoped count so the modal can say
  // "6 of 1069 on this page" when a section is selected.
  const [pageRebindableCount, setPageRebindableCount] = useState(0);
  // Per-layer detail for the modal's collapsible per-font list — each entry
  // is { id, name, families }; clicking a row selects & zooms to the layer.
  const [rebindableLayers, setRebindableLayers] = useState<
    Array<{ id: string; name: string; families: string[] }>
  >([]);
  const [isRebindOpen, setIsRebindOpen] = useState(false);
  // Re-apply run state: the modal stays open across the run, its button shows
  // a busy label while the sandbox walks nodes, and the outcome renders as an
  // inline banner (the toast alone was easy to miss once the modal closed).
  const [isReapplying, setIsReapplying] = useState(false);
  const [rebindResult, setRebindResult] = useState<RebindResultInfo | null>(null);
  const [expiringDaysRemaining, setExpiringDaysRemaining] = useState<
    number | null
  >(null);
  // Post-import diagnostics: categorised warnings with the node ids the
  // sandbox collected during rendering. The report opens itself, because the
  // whole point is that the user learns WHICH layers degraded — a toast they
  // can dismiss without reading is what we had before.
  const [importWarnings, setImportWarnings] = useState<ImportWarning[]>([]);
  const [importWarningOverflow, setImportWarningOverflow] = useState(0);
  const [isImportReportOpen, setIsImportReportOpen] = useState(false);
  const [importReportSource, setImportReportSource] = useState<ReportSource>();

  // Post-import report from the sandbox (main.ts posts `import-report` right
  // after the success toast). An empty list is still sent — it clears a stale
  // report from a previous import.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg || msg.type !== "import-report") return;
      const raw = msg.data?.warnings;
      const warnings: ImportWarning[] = Array.isArray(raw)
        ? raw.filter(
            (w: unknown): w is ImportWarning =>
              !!w &&
              typeof (w as ImportWarning).category === "string" &&
              typeof (w as ImportWarning).message === "string",
          )
        : [];
      const overflow =
        typeof msg.data?.overflow === "number" ? msg.data.overflow : 0;
      setImportWarnings(warnings);
      setImportWarningOverflow(overflow);
      // Where the import came from — the report's "Report this to the
      // developer" button only appears for a reportable (URL/extension) one.
      const data = msg.data ?? {};
      setImportReportSource(
        typeof data.sourceUrl === "string"
          ? {
              sourceUrl: data.sourceUrl,
              kind: typeof data.kind === "string" ? (data.kind as ReportSource["kind"]) : undefined,
              viewports: Array.isArray(data.viewports)
                ? data.viewports.filter((v: unknown): v is number => typeof v === "number")
                : [],
            }
          : undefined,
      );
      setIsImportReportOpen(warnings.length > 0);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Listen for quota-exceeded events dispatched by import API callers
  // (see shared/quotaEvents.ts → isQuotaExceeded).
  useEffect(() => {
    return onQuotaExceeded(() => setIsQuotaExceededOpen(true));
  }, []);

  // Listen for tab-switch requests from inside a tab (see
  // shared/importTabEvents.ts → requestImportTab).
  useEffect(() => {
    return onImportTabRequest(setImportTab);
  }, []);

  // Track how many text nodes still need their original font re-applied.
  // The sandbox (main.ts) scans the current page and replies with
  // `rebindable-count`; it also pushes updates unprompted after imports,
  // rebinds, and page switches. We request an initial count on mount.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (msg?.type === "installed-fonts") {
        const families = msg.data?.families;
        setInstalledFontFamilies(
          Array.isArray(families)
            ? families.filter((f: unknown): f is string => typeof f === "string")
            : [],
        );
        return;
      }
      if (msg?.type === "rebind-result") {
        // Sandbox finished (or failed) a re-apply run — release the modal's
        // busy button and surface the outcome inline.
        setIsReapplying(false);
        setRebindResult((msg.data as RebindResultInfo) ?? { error: true });
        return;
      }
      if (!msg || msg.type !== "rebindable-count") return;
      const count = msg.data?.count;
      if (typeof count === "number") setRebindableCount(count);
      const families = msg.data?.families;
      if (Array.isArray(families)) {
        setRebindableFamilies(families.filter((f): f is string => typeof f === "string"));
      }
      const selectionCount = msg.data?.selectionCount;
      setSelectionRebindableCount(
        typeof selectionCount === "number" ? selectionCount : 0,
      );
      const selActive = msg.data?.selectionActive;
      setSelectionActive(selActive === true);
      const pageCount = msg.data?.pageCount;
      setPageRebindableCount(
        typeof pageCount === "number" ? pageCount : (count ?? 0),
      );
      const layers = msg.data?.layers;
      setRebindableLayers(
        Array.isArray(layers)
          ? layers.filter(
              (l): l is { id: string; name: string; families: string[] } =>
                !!l &&
                typeof l.id === "string" &&
                typeof l.name === "string" &&
                Array.isArray(l.families),
            )
          : [],
      );
    };
    window.addEventListener("message", handler);
    parent.postMessage(
      { pluginMessage: { type: "count-rebindable-fonts" } },
      "*",
    );
    return () => window.removeEventListener("message", handler);
  }, []);

  const { setOpenSettingsCallback } = useConfig();
  const { license } = useLicense();

  // Expiry heads-up: on plugin open, if the user is Pro with ≤3 days left,
  // surface ExpiringSoonModal once. Re-shows on every plugin reopen inside
  // the window — no persistent dismissal. Once daysRemaining hits 0 the
  // lazy-downgrade flips them to Free server-side and this gate naturally
  // stops firing.
  useEffect(() => {
    if (!license || license.plan !== "pro") return;
    const ms = new Date(license.cycleEndsAt).getTime() - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return;
    const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
    if (days <= 3) setExpiringDaysRemaining(days);
  }, [license]);

  // Handle asset conversion requests from sandbox (AVIF/WebP → JPEG via Canvas)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg || msg.type !== "convert-assets") return;

      const assets: Array<{ url: string; dataUri: string }> = msg.data?.assets || [];
      if (assets.length === 0) {
        parent.postMessage({ pluginMessage: { type: "assets-converted", data: { convertedAssets: [] } } }, "*");
        return;
      }

      // Convert each asset via Canvas
      const convertAll = async () => {
        for (const asset of assets) {
          try {
            // Create image from data URI
            const img = new Image();
            img.crossOrigin = "anonymous";
            await new Promise<void>((resolve, reject) => {
              img.onload = () => resolve();
              img.onerror = () => reject(new Error("Image load failed"));
              img.src = asset.dataUri;
            });

            // Draw to canvas and export. JPEG has no alpha channel — a
            // transparent WebP/AVIF logo converted to JPEG flattens onto
            // black. Detect transparency and export those as PNG; fully
            // opaque images keep JPEG 0.85 (smaller).
            // Figma rejects anything over 4096px (utils/figmaImageLimit.ts),
            // so an oversized image is drawn into a canvas that fits.
            const originalWidth = img.naturalWidth;
            const originalHeight = img.naturalHeight;
            const { width, height } = fitWithinFigmaLimit(originalWidth, originalHeight);
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("No 2d context");
            ctx.drawImage(img, 0, 0, width, height);

            let needsPng = false;
            if (mayHaveAlpha(asset.dataUri)) {
              try {
                const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                needsPng = hasTransparentPixel(rgba);
              } catch {
                // getImageData failed (tainted canvas) — assume opaque.
              }
            }
            const convertedDataUri = needsPng
              ? canvas.toDataURL("image/png")
              : canvas.toDataURL("image/jpeg", 0.85);

            // One message per asset: the sandbox keeps whatever arrived if its
            // 30s window closes before the batch does.
            parent.postMessage({
              pluginMessage: {
                type: "asset-converted",
                data: { url: asset.url, dataUri: convertedDataUri, width, height, originalWidth, originalHeight },
              },
            }, "*");
          } catch {
            // Image conversion failed — skip this asset (falls back to placeholder).
          }
        }

        parent.postMessage({ pluginMessage: { type: "assets-converted", data: {} } }, "*");
      };

      convertAll();
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  // Stable callback to open settings modal
  const openSettings = useCallback((panel: SettingsPanel = "configuration") => {
    setSettingsPanel(panel);
    setIsSettingsOpen(true);
  }, []);

  // Register openSettings callback with ConfigContext
  useEffect(() => {
    if (setOpenSettingsCallback) {
      setOpenSettingsCallback(openSettings);

      // Cleanup: unregister callback on unmount to prevent memory leaks
      return () => {
        setOpenSettingsCallback((_panel: SettingsPanel) => {});
      };
    }
  }, [setOpenSettingsCallback, openSettings]);

  // Render import tab content
  const renderImportContent = () => {
    switch (importTab) {
      case "web":
        return <Web />;
      case "screenshot":
        return <Screenshot />;
      case "html":
        return <HTML />;
      case "area":
        return <AreaSelection />;
      default:
        return null;
    }
  };

  return (
    <Fragment>
    <div class={styles.app} data-w2w-app="true">
      {/* Sub Header */}
      <SubHeader currentTab={importTab} onTabChange={setImportTab} />

      {/* Content Area — labelled by the active tab in SubHeader */}
      <div
        class={importStyles.content}
        role="tabpanel"
        id={`panel-${importTab}`}
        aria-labelledby={`tab-${importTab}`}
        tabIndex={0}
      >
        {renderImportContent()}
      </div>

      {/* Footer Bar */}
      <Footer
        onSettingsClick={() => setIsSettingsOpen(true)}
        onHelpClick={() => setIsHelpOpen(true)}
        onPlanClick={() => setIsPlanOpen(true)}
        showExtension={true}
        onExtensionClick={() => {
          setIsExtensionOpen(true);
        }}
        showRebindFonts={rebindableCount > 0}
        rebindFontsLabel={
          selectionRebindableCount > 0 ? "Re-apply to selection" : "Re-apply fonts"
        }
        onRebindFontsClick={() => {
          // Opens the info modal (install → select → re-apply); the modal's
          // own button fires the actual `rebind-original-fonts` action.
          setIsRebindOpen(true);
          // The per-font "use instead" picker needs the families this Figma
          // can offer; ask now so the list is there when the user expands one.
          parent.postMessage(
            { pluginMessage: { type: "list-installed-fonts" } },
            "*",
          );
        }}
      />
    </div>

    {/* Modals — rendered as siblings of the app root so the `inert`
        attribute applied to [data-w2w-app="true"] (by useModal) doesn't
        accidentally disable the modal's own controls. */}
    <Settings
      isOpen={isSettingsOpen}
      onClose={() => setIsSettingsOpen(false)}
      initialPanel={settingsPanel}
    />
    <Help isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    <ExtensionModal
      isOpen={isExtensionOpen}
      onClose={() => setIsExtensionOpen(false)}
    />
    <ImportReportModal
      isOpen={isImportReportOpen}
      onClose={() => setIsImportReportOpen(false)}
      warnings={importWarnings}
      overflow={importWarningOverflow}
      source={importReportSource}
      onSelectLayer={(nodeId) => {
        // Sandbox selects the layer and zooms to it. The report stays open so
        // the user can walk down the list without reopening it each time.
        parent.postMessage(
          {
            pluginMessage: {
              type: "select-import-warning-layer",
              data: { nodeId },
            },
          },
          "*",
        );
      }}
    />
    <RebindFontsModal
      isOpen={isRebindOpen}
      onClose={() => {
        setIsRebindOpen(false);
        // Stale outcome shouldn't greet the next open — each run reports fresh.
        setRebindResult(null);
      }}
      count={rebindableCount}
      selectionCount={selectionRebindableCount}
      pageCount={pageRebindableCount}
      selectionActive={selectionActive}
      installedFonts={installedFontFamilies}
      choices={fontChoices}
      onChoiceChange={(family, chosen) =>
        setFontChoices((prev) => {
          const next = { ...prev };
          if (chosen) next[family] = chosen;
          else delete next[family];
          return next;
        })
      }
      missingFonts={rebindableFamilies}
      layers={rebindableLayers}
      onSelectLayer={(id) => {
        // Sandbox selects the layer and zooms the viewport to it, so the
        // user sees exactly which element the pending font refers to. The
        // modal stays open for browsing several layers in a row.
        parent.postMessage(
          { pluginMessage: { type: "select-rebind-layer", data: { nodeId: id } } },
          "*",
        );
      }}
      onReapply={() => {
        // Sandbox handles `rebind-original-fonts`: walks selection (or page
        // if empty), re-applies any text node that carries the
        // `w2w_original_font` / segment markers, and posts `rebind-result`
        // back. The modal STAYS OPEN — the button goes busy and the outcome
        // renders inline, so the user actually sees what happened.
        setIsReapplying(true);
        setRebindResult(null);
        parent.postMessage(
          {
            pluginMessage: {
              type: "rebind-original-fonts",
              // Families the user chose to replace rather than install.
              data: { substitutions: fontChoices },
            },
          },
          "*",
        );
      }}
      isReapplying={isReapplying}
      result={rebindResult}
    />
    <Plan isOpen={isPlanOpen} onClose={() => setIsPlanOpen(false)} />
    <QuotaExceededModal
      isOpen={isQuotaExceededOpen}
      onClose={() => setIsQuotaExceededOpen(false)}
      onUpgrade={() => {
        setIsQuotaExceededOpen(false);
        setIsPlanOpen(true);
      }}
    />
    <ExpiringSoonModal
      isOpen={expiringDaysRemaining !== null}
      daysRemaining={expiringDaysRemaining ?? 0}
      onClose={() => setExpiringDaysRemaining(null)}
      onExtend={() => {
        setExpiringDaysRemaining(null);
        setIsPlanOpen(true);
      }}
    />
    </Fragment>
  );
}
