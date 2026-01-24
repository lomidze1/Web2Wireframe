import type { ReactElement } from "react";
import { Routes, Route, Navigate, Link } from "react-router-dom";
import DocsLayout from "./DocsLayout";
import { getTopics } from "./data/docsStructure";
import styles from "./Docs.module.scss";

import IntroductionWhatIs from "./pages/IntroductionWhatIs";
import IntroductionWhy from "./pages/IntroductionWhy";
import StartGettingStarted from "./pages/StartGettingStarted";
import StartSetSettings from "./pages/StartSetSettings";
import StartFastFirstImport from "./pages/StartFastFirstImport";
import InstallHowTo from "./pages/InstallHowTo";
import ImportWeb from "./pages/ImportWeb";
import ImportScreenshot from "./pages/ImportScreenshot";
import ImportHTML from "./pages/ImportHTML";
import ImportAreaCapture from "./pages/ImportAreaCapture";
import BrowserExtensionOverview from "./pages/BrowserExtensionOverview";
import BrowserExtensionImport from "./pages/BrowserExtensionImport";
import AIGenerationOverview from "./pages/AIGenerationOverview";
import AIGenerationPage from "./pages/AIGenerationPage";
import AIGenerationBlock from "./pages/AIGenerationBlock";
import AIGenerationPricing from "./pages/AIGenerationPricing";
import LibraryOverview from "./pages/LibraryOverview";
import LibraryMy from "./pages/LibraryMy";
import LibraryCommunity from "./pages/LibraryCommunity";
import LibraryContributing from "./pages/LibraryContributing";
import LibraryBestPractices from "./pages/LibraryBestPractices";
import LibraryValue from "./pages/LibraryValue";
import PricingOverview from "./pages/PricingOverview";
import PricingPurchase from "./pages/PricingPurchase";
import PricingAdditional from "./pages/PricingAdditional";

const DocsHub = (): ReactElement => {
  const topics = getTopics();

  return (
    <DocsLayout>
      <h2>Documentation Hub</h2>
      <p>Everything you need to get W2W running smoothly.</p>

      <div className={styles.docsGrid}>
        {topics.map((topic) => (
          <Link key={topic.id} to={topic.path} className={styles.docsCard}>
            <div className={styles.cardIcon}>{topic.icon}</div>
            <h3>{topic.title}</h3>
            <span className={styles.cardArrow}>→</span>
          </Link>
        ))}
      </div>
    </DocsLayout>
  );
};

const Docs = (): ReactElement => {
  return (
    <>
      <Routes>
        <Route path="/" element={<DocsHub />} />
        <Route
          path="/introduction"
          element={<Navigate to="/docs/introduction/what-is" replace />}
        />
        <Route path="/introduction/what-is" element={<IntroductionWhatIs />} />
        <Route
          path="/introduction/why-web2wireframe"
          element={<IntroductionWhy />}
        />
        <Route
          path="/start"
          element={<Navigate to="/docs/start/getting-started" replace />}
        />
        <Route
          path="/start/getting-started"
          element={<StartGettingStarted />}
        />
        <Route path="/start/how-to-install" element={<InstallHowTo />} />
        <Route path="/start/set-settings" element={<StartSetSettings />} />
        <Route
          path="/start/fast-first-import"
          element={<StartFastFirstImport />}
        />
        <Route
          path="/import-methods"
          element={<Navigate to="/docs/import-methods/web-import" replace />}
        />
        <Route path="/import-methods/web-import" element={<ImportWeb />} />
        <Route
          path="/import-methods/screenshot-import"
          element={<ImportScreenshot />}
        />
        <Route path="/import-methods/html-import" element={<ImportHTML />} />
        <Route
          path="/import-methods/area-capture"
          element={<ImportAreaCapture />}
        />
        <Route
          path="/browser-extension"
          element={
            <Navigate to="/docs/browser-extension/extension-overview" replace />
          }
        />
        <Route
          path="/browser-extension/extension-overview"
          element={<BrowserExtensionOverview />}
        />
        <Route
          path="/browser-extension/import-with-extension"
          element={<BrowserExtensionImport />}
        />
        <Route
          path="/ai-generation"
          element={<Navigate to="/docs/ai-generation/overview" replace />}
        />
        <Route
          path="/ai-generation/overview"
          element={<AIGenerationOverview />}
        />
        <Route
          path="/ai-generation/page-generation"
          element={<AIGenerationPage />}
        />
        <Route
          path="/ai-generation/block-generation"
          element={<AIGenerationBlock />}
        />
        <Route
          path="/ai-generation/pricing"
          element={<AIGenerationPricing />}
        />
        <Route
          path="/library"
          element={<Navigate to="/docs/library/overview" replace />}
        />
        <Route path="/library/overview" element={<LibraryOverview />} />
        <Route path="/library/my-library" element={<LibraryMy />} />
        <Route
          path="/library/community-library"
          element={<LibraryCommunity />}
        />
        <Route path="/library/contributing" element={<LibraryContributing />} />
        <Route
          path="/library/best-practices"
          element={<LibraryBestPractices />}
        />
        <Route path="/library/value" element={<LibraryValue />} />
        <Route
          path="/pricing"
          element={<Navigate to="/docs/pricing/overview" replace />}
        />
        <Route path="/pricing/overview" element={<PricingOverview />} />
        <Route path="/pricing/purchase" element={<PricingPurchase />} />
        <Route path="/pricing/additional" element={<PricingAdditional />} />
      </Routes>
    </>
  );
};

export default Docs;
