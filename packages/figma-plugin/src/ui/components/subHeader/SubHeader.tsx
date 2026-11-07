/** @jsx h */
import { h } from "preact";
import { useRef } from "preact/hooks";
import styles from "./SubHeader.css";

type ImportTab = "web" | "html" | "area";

interface TabDef {
  id: ImportTab;
  label: string;
}

const VISIBLE_TABS: TabDef[] = [
  { id: "web", label: "Web" },
  { id: "area", label: "Area" },
  { id: "html", label: "HTML" },
];

interface SubHeaderProps {
  currentTab: ImportTab;
  onTabChange: (tab: ImportTab) => void;
}

export default function SubHeader({ currentTab, onTabChange }: SubHeaderProps) {
  // Refs for arrow-key tab navigation (W3C tab pattern).
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const focusTab = (index: number) => {
    const tab = tabRefs.current[index];
    if (tab) {
      tab.focus();
      onTabChange(VISIBLE_TABS[index].id);
    }
  };

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    const last = VISIBLE_TABS.length - 1;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusTab(index === last ? 0 : index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusTab(index === 0 ? last : index - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusTab(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusTab(last);
    }
  };

  return (
    <div class={styles.subHeader}>
      <div
        class={styles.contentNav}
        role="tablist"
        aria-orientation="horizontal"
        aria-label="Import method"
      >
        {VISIBLE_TABS.map((tab, i) => {
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              tabIndex={isActive ? 0 : -1}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              class={`${styles.tabBtn} ${isActive ? styles.tabBtnActive : ""}`}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(e) => handleKeyDown(e, i)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
