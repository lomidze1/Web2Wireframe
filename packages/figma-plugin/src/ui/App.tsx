/** @jsx h */
import { h } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";

// Import main pages
import AIGenerationPage from "./pages/aiGeneration/AIGenerationPage";
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

// Components
import Footer from "./components/footer";
import TopNav from "./components/topNav";
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

type Page = "import" | "ai";
type ImportTab = "web" | "screenshot" | "html" | "area" | "extension";

export default function App() {
  return (
    <ConfigProvider>
      <AppContent />
    </ConfigProvider>
  );
}

function AppContent() {
  const [page, setPage] = useState<Page>("import");
  const [importTab, setImportTab] = useState<ImportTab>("web");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsPanel, setSettingsPanel] =
    useState<SettingsPanel>("configuration");
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isPlanOpen, setIsPlanOpen] = useState(false);

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
    <div class={styles.app}>
      {/* Header - Main Navigation */}
      <TopNav currentPage={page} onPageChange={setPage} />

      {/* Sub Header - Only for Import page */}
      {page === "import" && (
        <SubHeader currentTab={importTab} onTabChange={setImportTab} />
      )}

      {/* Content Area */}
      <div class={importStyles.content}>
        {page === "import" && renderImportContent()}
        {page === "ai" && <AIGenerationPage />}
      </div>

      {/* Footer Bar */}
      <Footer
        onSettingsClick={() => setIsSettingsOpen(true)}
        onHelpClick={() => setIsHelpOpen(true)}
        onPlanClick={() => setIsPlanOpen(true)}
        showExtension={page === "import"}
        onExtensionClick={() => {
          setPage("import");
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

      {/* Modals */}
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialPanel={settingsPanel}
      />
      <Help isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <Plan isOpen={isPlanOpen} onClose={() => setIsPlanOpen(false)} />
    </div>
  );
}
