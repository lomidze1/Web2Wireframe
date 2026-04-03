/** @jsx h */
import { h } from "preact";
import { useState, useMemo } from "preact/hooks";
import styles from "./LibraryPage.css";
import WebImported from "./myLibrary/webImported";
import AIGenerated from "./myLibrary/aiGenerated";
import Community from "./community";
import { LibraryMode, MyLibraryTab } from "./shared/types";

interface LibraryPageProps {
  onNavigateToImport?: () => void;
  onNavigateToAIGeneration?: () => void;
}

export default function LibraryPage({
  onNavigateToImport,
  onNavigateToAIGeneration,
}: LibraryPageProps) {
  const [mode, setMode] = useState<LibraryMode>("my");
  const [myLibraryTab, setMyLibraryTab] = useState<MyLibraryTab>("imported");

  // Mock counts - in real app these would come from storage/API
  const counts = useMemo(
    () => ({
      imported: 5,
      aiGenerated: 6,
      community: 12458,
    }),
    []
  );

  return (
    <div class={styles.libraryContainer}>
      {/* Primary Navigation: My Library vs Community */}
      <div class={styles.primaryNav}>
        <button
          class={`${styles.primaryTab} ${mode === "my" ? styles.active : ""}`}
          onClick={() => setMode("my")}
        >
          My Library
        </button>
        <button
          class={`${styles.primaryTab} ${styles.communityPrimary} ${
            mode === "community" ? styles.active : ""
          }`}
          onClick={() => setMode("community")}
        >
          Community Library
        </button>
      </div>

      {/* Secondary Navigation: Only for My Library */}
      {mode === "my" && (
        <div class={styles.secondaryNav}>
          <button
            class={`${styles.secondaryTab} ${
              myLibraryTab === "imported" ? styles.active : ""
            }`}
            onClick={() => setMyLibraryTab("imported")}
          >
            <span class={styles.tabIcon}>🌐</span>
            Web Imported
            <span class={styles.tabCount}>{counts.imported}</span>
          </button>
          <button
            class={`${styles.secondaryTab} ${
              myLibraryTab === "ai-generated" ? styles.active : ""
            }`}
            onClick={() => setMyLibraryTab("ai-generated")}
          >
            <span class={styles.tabIcon}>🤖</span>
            AI Generated
            <span class={styles.tabCount}>{counts.aiGenerated}</span>
          </button>
        </div>
      )}

      {/* Content Area */}
      <div class={styles.contentArea}>
        {mode === "my" && myLibraryTab === "imported" && (
          <WebImported onNavigateToImport={onNavigateToImport} />
        )}
        {mode === "my" && myLibraryTab === "ai-generated" && (
          <AIGenerated onNavigateToAIGeneration={onNavigateToAIGeneration} />
        )}
        {mode === "community" && <Community />}
      </div>
    </div>
  );
}
