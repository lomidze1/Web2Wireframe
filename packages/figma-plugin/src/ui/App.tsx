/** @jsx h */
import { h, Fragment } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";

// Import sub-pages
import Web from "./pages/import/web";
import Screenshot from "./pages/import/screenshot";
import HTML from "./pages/import/html";
import AreaSelection from "./pages/import/areaSelection";
import BrowserExtension from "./pages/import/browserExtension";

// Modals
import Settings from "./components/modalPopup/Settings";
import Help from "./components/modalPopup/Help";
import Plan from "./components/modalPopup/planPopup/Plan";
import QuotaExceededModal from "./components/modalPopup/QuotaExceededModal";

import ConnectFigma from "./components/ConnectFigma";
import { applyAuthToken, refreshAuthToken } from "./shared/licenseClient";

import { onQuotaExceeded } from "./shared/quotaEvents";

// Components
import Footer from "./components/footer";
import SubHeader from "./components/subHeader";

// Import Config Context
import {
  ConfigProvider,
  useConfig,
  SettingsPanel,
} from "./shared/ConfigContext";

// Import global and base styles
import styles from "./styles/ui.css";
import importStyles from "./pages/import/Import.css";

// CSS Variables to validate in development
const CSS_VARS_TO_CHECK = [
  "--bg",
  "--panel",
  "--accent",
  "--text",
  "--main-gradient",
];

type ImportTab = "web" | "screenshot" | "html" | "area" | "extension";

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
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg || msg.type !== "auth-token-loaded") return;
      const stored = msg.data as
        | { token?: string; expiresAt?: number }
        | null;
      if (
        stored &&
        typeof stored.token === "string" &&
        typeof stored.expiresAt === "number" &&
        stored.expiresAt - 60_000 > Date.now()
      ) {
        applyAuthToken(stored.token, stored.expiresAt);
        setConn("connected");
        // Roll the long-lived token's expiry in the background.
        void refreshAuthToken();
      } else {
        setConn("disconnected");
      }
    };
    window.addEventListener("message", handler);
    parent.postMessage({ pluginMessage: { type: "load-auth-token" } }, "*");
    return () => window.removeEventListener("message", handler);
  }, []);

  if (conn === "loading") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          fontSize: "12px",
          opacity: 0.6,
        }}
      >
        Loading…
      </div>
    );
  }
  if (conn === "disconnected") {
    return <ConnectFigma onConnected={() => setConn("connected")} />;
  }
  return <AppContent />;
}

function AppContent() {
  const [importTab, setImportTab] = useState<ImportTab>("web");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsPanel, setSettingsPanel] =
    useState<SettingsPanel>("configuration");
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [isQuotaExceededOpen, setIsQuotaExceededOpen] = useState(false);

  // Listen for quota-exceeded events dispatched by import API callers
  // (see shared/quotaEvents.ts → isQuotaExceeded).
  useEffect(() => {
    return onQuotaExceeded(() => setIsQuotaExceededOpen(true));
  }, []);

  const { setOpenSettingsCallback } = useConfig();

  // Handle asset conversion requests from sandbox (AVIF/WebP → JPEG via Canvas)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg || msg.type !== "convert-assets") return;

      const assets: Array<{ url: string; dataUri: string; frameIdx: number }> = msg.data?.assets || [];
      if (assets.length === 0) {
        parent.postMessage({ pluginMessage: { type: "assets-converted", data: { convertedAssets: [] } } }, "*");
        return;
      }

      // Convert each asset via Canvas
      const convertAll = async () => {
        const results: Array<{ url: string; dataUri: string; frameIdx: number }> = [];

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

            // Draw to canvas and export as JPEG
            const canvas = document.createElement("canvas");
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("No 2d context");
            ctx.drawImage(img, 0, 0);
            const jpegDataUri = canvas.toDataURL("image/jpeg", 0.85);

            results.push({ url: asset.url, dataUri: jpegDataUri, frameIdx: asset.frameIdx });
          } catch {
            // Image conversion failed — skip this asset (falls back to placeholder).
          }
        }

        parent.postMessage({ pluginMessage: { type: "assets-converted", data: { convertedAssets: results } } }, "*");
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
      case "extension":
        return <BrowserExtension />;
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
          setImportTab("extension");
        }}
        onRebindFontsClick={() => {
          // Sandbox handles `rebind-original-fonts`: walks selection (or page
          // if empty), re-applies any text node that carries the
          // `w2w_original_font` marker, and reports a toast via figma.notify.
          parent.postMessage(
            { pluginMessage: { type: "rebind-original-fonts" } },
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
    <Plan isOpen={isPlanOpen} onClose={() => setIsPlanOpen(false)} />
    <QuotaExceededModal
      isOpen={isQuotaExceededOpen}
      onClose={() => setIsQuotaExceededOpen(false)}
      onUpgrade={() => {
        setIsQuotaExceededOpen(false);
        setIsPlanOpen(true);
      }}
    />
    </Fragment>
  );
}
