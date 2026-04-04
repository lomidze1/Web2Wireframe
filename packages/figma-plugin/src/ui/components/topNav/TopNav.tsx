/** @jsx h */
import { h } from "preact";
import styles from "./TopNav.css";

type Page = "import" | "ai";

interface TopNavProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
}

export default function TopNav({ currentPage, onPageChange }: TopNavProps) {
  return (
    <div class={styles.topNav}>
      <button
        class={
          currentPage === "import" ? styles.navButtonActive : styles.navButton
        }
        onClick={() => onPageChange("import")}
      >
        Import
      </button>
      <button
        class={currentPage === "ai" ? styles.navButtonActive : styles.navButton}
        onClick={() => onPageChange("ai")}
      >
        AI Generations
      </button>
    </div>
  );
}
