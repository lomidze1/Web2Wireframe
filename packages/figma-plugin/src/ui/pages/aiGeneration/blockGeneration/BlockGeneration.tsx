/** @jsx h */
import { h } from "preact";
import { useState, useCallback, useEffect, useRef } from "preact/hooks";
import { useConfig } from "../../../shared/ConfigContext";
import styles from "./BlockGeneration.css";

const API_URL = "http://localhost:3002";

// Types
type Density = "balanced" | "detailed";
type BlockType =
  | "hero"
  | "header"
  | "footer"
  | "pricing"
  | "testimonials"
  | "faq"
  | "cta"
  | "team"
  | "features";

interface BlockGenerationProps {
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

export default function BlockGeneration({ onBack }: BlockGenerationProps) {
  const { openSettings, config } = useConfig();
  const [density, setDensity] = useState<Density>("balanced");
  const [viewports, setViewports] = useState<number[]>([1440]);
  const [selectedBlock, setSelectedBlock] = useState<BlockType | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listen for wireframe creation results from Figma sandbox
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage;
      if (!msg) return;
      if (msg.type === "wireframe-created") {
        setIsGenerating(false);
      }
      if (msg.type === "wireframe-error") {
        setIsGenerating(false);
        setError(msg.data.error || "Failed to create wireframe");
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const blockTypes: BlockType[] = [
    "hero",
    "header",
    "footer",
    "pricing",
    "testimonials",
    "faq",
    "cta",
    "team",
    "features",
  ];

  const viewportOptions = [
    { size: 1920, label: "1920" },
    { size: 1440, label: "1440" },
    { size: 1024, label: "1024" },
    { size: 768, label: "768" },
    { size: 375, label: "375" },
  ];

  const handleSelectBlock = useCallback((block: BlockType) => {
    setSelectedBlock(block);
  }, []);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/generate-block`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: `figma-user-${Date.now()}`,
          blockType: selectedBlock,
          density,
          viewports,
          pluginColors: config.pluginColors,
          pluginFont: config.pluginFont,
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }
      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Generation failed");

      // Send directly to Figma sandbox — no transform needed (backend returns WireframeNode)
      parent.postMessage(
        {
          pluginMessage: {
            type: "render-wireframe",
            data: {
              frames: data.wireframeData.frames,
              sourceUrl: data.sourceUrl,
              pluginColors: data.pluginColors,
              pluginFont: config.pluginFont,
              variableMode: "direct",
              layoutMode: "autoLayout",
              colorMode: "plugin",
              fontMode: "plugin",
              textMode: "semantic",
            },
          },
        },
        "*"
      );
    } catch (err: unknown) {
      setIsGenerating(false);
      setError(err instanceof Error ? err.message : "Generation failed");
    }
  }, [density, viewports, selectedBlock, config]);

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

        <h2 class={styles.generatorTitle}>Generate Block</h2>

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
          <label class={styles.controlLabel}>Select Block Type</label>
          <div class={styles.chipsContainer}>
            {blockTypes.map((block) => (
              <Chip
                key={block}
                label={block.charAt(0).toUpperCase() + block.slice(1)}
                selected={selectedBlock === block}
                onClick={() => handleSelectBlock(block)}
              />
            ))}
          </div>
        </div>

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
          disabled={!selectedBlock || isGenerating}
          type="button"
        >
          {isGenerating ? "Generating…" : "Generate Wireframe"}
        </button>

        {error && <p class={styles.errorText}>{error}</p>}
      </div>
    </div>
  );
}
