/** @jsx h */
import { h } from "preact";
import { useState, useCallback, useEffect, useRef } from "preact/hooks";
import { useConfig } from "../../../shared/ConfigContext";
import styles from "./PageGeneration.css";

// Types
type Density = "balanced" | "detailed";
type PageType =
  | "home"
  | "about"
  | "pricing"
  | "contact"
  | "blog"
  | "login"
  | "register"
  | "faq";

interface PageGenerationProps {
  onBack: () => void;
}

// Chip Component
const Chip = ({
  label,
  selected,
  onClick,
  disabled,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    class={`${styles.chip} ${selected ? styles.chipSelected : ""} ${
      disabled ? styles.chipDisabled : ""
    }`}
    onClick={onClick}
    disabled={disabled}
    type="button"
  >
    {label}
  </button>
);

// Segmented Control Component
const SegmentedControl = ({
  options,
  selected,
  onChange,
  label,
}: {
  options: { label: string; value: Density }[];
  selected: Density;
  onChange: (value: Density) => void;
  label?: string;
}) => (
  <div class={styles.segmentedControl}>
    {label && <label class={styles.controlLabel}>{label}</label>}
    <div class={styles.segmentedGroup}>
      {options.map((opt) => (
        <button
          key={opt.value}
          class={`${styles.segmentedOption} ${
            selected === opt.value ? styles.segmentedOptionActive : ""
          }`}
          onClick={() => onChange(opt.value)}
          type="button"
        >
          {opt.label}
        </button>
      ))}
    </div>
  </div>
);

// Viewport Dropdown Component
const ViewportDropdown = ({
  selected,
  onChange,
  available,
}: {
  selected: number[];
  onChange: (viewports: number[]) => void;
  available: Array<{ size: number; label: string; locked?: boolean }>;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const toggleViewport = (size: number, event?: Event) => {
    if (event) {
      event.stopPropagation();
    }
    if (selected.includes(size)) {
      if (selected.length > 1) {
        onChange(selected.filter((v) => v !== size));
      }
    } else {
      onChange([...selected, size]);
    }
  };

  // Sort selected viewports by size (large to small) for display
  const sortedSelected = [...selected].sort((a, b) => b - a);
  const viewportLabels = sortedSelected
    .map((s) => available.find((a) => a.size === s)?.label)
    .filter(Boolean)
    .join(", ");

  return (
    <div class={styles.viewportDropdown} ref={dropdownRef}>
      <label class={styles.controlLabel}>Viewport</label>
      <button
        class={styles.dropdownTrigger}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span class={styles.dropdownValue}>
          {viewportLabels || "Select viewports"}
        </span>
        <span class={styles.dropdownIcon}>▼</span>
      </button>
      {isOpen && (
        <div class={styles.dropdownMenu}>
          {available.map((item) => {
            const isSelected = selected.includes(item.size);
            return (
              <label
                key={item.size}
                class={`${styles.dropdownItem} ${
                  item.locked ? styles.dropdownItemLocked : ""
                } ${isSelected ? styles.dropdownItemSelected : ""}`}
                title={item.locked ? "Locked on your plan" : ""}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={(e) => !item.locked && toggleViewport(item.size, e)}
                  disabled={item.locked}
                />
                <span>{item.label}</span>
                {item.locked && <span class={styles.lockIcon}>🔒</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
};

// Collapsible Panel Component
const CollapsiblePanel = ({
  title,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: preact.ComponentChildren;
}) => (
  <div class={styles.collapsiblePanel}>
    <button
      class={`${styles.collapsibleHeader} ${
        isOpen ? styles.collapsibleHeaderOpen : ""
      }`}
      onClick={onToggle}
      type="button"
    >
      <span>{title}</span>
      <span class={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`}>
        ›
      </span>
    </button>
    {isOpen && <div class={styles.collapsibleContent}>{children}</div>}
  </div>
);

export default function PageGeneration({ onBack }: PageGenerationProps) {
  const { openSettings } = useConfig();
  const [density, setDensity] = useState<Density>("balanced");
  const [viewports, setViewports] = useState<number[]>([1440]);
  const [selectedPage, setSelectedPage] = useState<PageType | null>(null);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [selectedSections, setSelectedSections] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const pageTypes: PageType[] = [
    "home",
    "about",
    "pricing",
    "contact",
    "blog",
    "login",
    "register",
    "faq",
  ];

  const pageSections: Record<PageType, string[]> = {
    home: [
      "Hero",
      "Features",
      "Testimonials",
      "Pricing",
      "FAQ",
      "CTA",
      "Footer",
    ],
    about: ["Hero", "Team", "Values", "Timeline", "FAQ", "CTA", "Footer"],
    pricing: ["Hero", "Pricing Cards", "Comparison", "FAQ", "CTA", "Footer"],
    contact: ["Hero", "Contact Form", "Map", "FAQ", "Footer"],
    blog: [
      "Hero",
      "Featured Posts",
      "Categories",
      "Newsletter Signup",
      "Footer",
    ],
    login: ["Hero", "Login Form", "Social Login", "Signup Link", "Footer"],
    register: ["Hero", "Signup Form", "Plan Selection", "Login Link", "Footer"],
    faq: ["Hero", "FAQ Accordion", "Related Articles", "CTA", "Footer"],
  };

  const viewportOptions = [
    { size: 1920, label: "1920" },
    { size: 1440, label: "1440" },
    { size: 1024, label: "1024" },
    { size: 768, label: "768" },
    { size: 375, label: "375" },
  ];

  const handleSelectPage = useCallback((page: PageType) => {
    setSelectedPage(page);
  }, []);

  const handleToggleSection = useCallback((section: string) => {
    setSelectedSections((prev) =>
      prev.includes(section)
        ? prev.filter((s) => s !== section)
        : [...prev, section]
    );
  }, []);

  const handleNotesChange = useCallback((value: string) => {
    if (value.length <= 140) {
      setNotes(value);
    }
  }, []);

  const handleGenerate = useCallback(() => {
    setIsGenerating(true);
    setTimeout(() => {
      setIsGenerating(false);
      // TODO: Implement AI page generation
    }, 2000);
  }, [density, viewports, selectedPage, selectedSections, notes]);

  return (
    <div class={styles.generatorContainer}>
      <div class={styles.backgroundGradient} />

      <div class={styles.generatorContent}>
        <button
          class={styles.backButton}
          onClick={onBack}
          type="button"
          title="Back to AI Generations"
        >
          ← Back
        </button>

        <h2 class={styles.generatorTitle}>Generate Page</h2>

        <div class={styles.controlsRow}>
          <ViewportDropdown
            selected={viewports}
            onChange={setViewports}
            available={viewportOptions}
          />
          <SegmentedControl
            label="Density"
            options={[
              { label: "Balanced", value: "balanced" },
              { label: "Detailed", value: "detailed" },
            ]}
            selected={density}
            onChange={setDensity}
          />
        </div>

        <div class={styles.chipSection}>
          <label class={styles.controlLabel}>Select Page Type</label>
          <div class={styles.chipsContainer}>
            {pageTypes.map((page) => (
              <Chip
                key={page}
                label={page.charAt(0).toUpperCase() + page.slice(1)}
                selected={selectedPage === page}
                onClick={() => handleSelectPage(page)}
              />
            ))}
          </div>
        </div>

        {selectedPage && (
          <CollapsiblePanel
            title="Customize structure"
            isOpen={customizeOpen}
            onToggle={() => setCustomizeOpen(!customizeOpen)}
          >
            <div class={styles.customizeContent}>
              <label class={styles.sectionLabel}>Include sections:</label>
              <div class={styles.sectionCheckboxes}>
                {pageSections[selectedPage].map((section) => (
                  <label key={section} class={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={selectedSections.includes(section)}
                      onChange={() => handleToggleSection(section)}
                    />
                    <span>{section}</span>
                  </label>
                ))}
              </div>

              <div class={styles.notesInput}>
                <label class={styles.sectionLabel}>Notes (optional)</label>
                <textarea
                  class={styles.textarea}
                  placeholder="Any special requirements..."
                  value={notes}
                  onInput={(e) =>
                    handleNotesChange((e.target as HTMLTextAreaElement).value)
                  }
                  maxLength={140}
                />
                <span class={styles.charCount}>{notes.length}/140</span>
              </div>
            </div>
          </CollapsiblePanel>
        )}

        <p class={styles.helperText}>
          Other options are configured in{" "}
          <span
            class={styles.settingsLink}
            onClick={() => openSettings && openSettings("configuration")}
          >
            Settings
          </span>
          .
        </p>

        <button
          class={`${styles.primaryButton} ${
            isGenerating ? styles.isLoading : ""
          }`}
          onClick={handleGenerate}
          disabled={
            !selectedPage ||
            isGenerating ||
            (customizeOpen && selectedSections.length === 0)
          }
          type="button"
        >
          {isGenerating ? "Generating…" : "Generate Wireframe"}
        </button>
      </div>
    </div>
  );
}
