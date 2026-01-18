/** @jsx h */
import { h } from "preact";
import { useState, useEffect, useCallback } from "preact/hooks";

// Import main pages
import AIGenerationPage from "./pages/aiGeneration/AIGenerationPage";
import LibraryPage from "./pages/library/LibraryPage";

// Import sub-pages
import Web from "./pages/import/web";
import Screenshot from "./pages/import/screenshot";
import HTML from "./pages/import/html";
import AreaSelection from "./pages/import/areaSelection";
import BrowserExtension from "./pages/import/browserExtension";

// Modals
import Settings from "./components/modalPopup/Settings";
import Help from "./components/modalPopup/Help";

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

type Page = "import" | "ai" | "library";
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
    useState<SettingsPanel>("terminology");
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const { setOpenSettingsCallback } = useConfig();

  // Stable callback to open settings modal
  const openSettings = useCallback((panel: SettingsPanel = "terminology") => {
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
        {page === "library" && <LibraryPage />}
      </div>

      {/* Footer Bar */}
      <Footer
        onSettingsClick={() => setIsSettingsOpen(true)}
        onHelpClick={() => setIsHelpOpen(true)}
        showExtension={page === "import"}
        onExtensionClick={() => {
          setPage("import");
          setImportTab("extension");
        }}
      />

      {/* Modals */}
      <Settings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        initialPanel={settingsPanel}
      />
      <Help isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
}
