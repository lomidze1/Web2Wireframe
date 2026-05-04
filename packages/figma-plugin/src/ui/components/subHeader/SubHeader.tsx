/** @jsx h */
import { h } from "preact";
import styles from "./SubHeader.css";

type ImportTab = "web" | "screenshot" | "html" | "area" | "extension";

interface SubHeaderProps {
  currentTab: ImportTab;
  onTabChange: (tab: ImportTab) => void;
}

export default function SubHeader({ currentTab, onTabChange }: SubHeaderProps) {
  return (
    <div class={styles.subHeader}>
      {/* Content Type Navigation */}
      <div class={styles.contentNav}>
        <button
          class={
            currentTab === "web" ? styles.navButtonActive : styles.navButton
          }
          onClick={() => onTabChange("web")}
        >
          Web
        </button>
        <button
          class={
            currentTab === "area" ? styles.navButtonActive : styles.navButton
          }
          onClick={() => onTabChange("area")}
        >
          Area Selection
        </button>
        <button
          class={
            currentTab === "html" ? styles.navButtonActive : styles.navButton
          }
          onClick={() => onTabChange("html")}
        >
          HTML
        </button>
        <button
          class={
            currentTab === "screenshot"
              ? styles.navButtonActive
              : styles.navButton
          }
          onClick={() => onTabChange("screenshot")}
        >
          Screenshot
        </button>
      </div>
    </div>
  );
}
