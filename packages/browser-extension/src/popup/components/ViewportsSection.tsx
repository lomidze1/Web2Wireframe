import { useState, useRef, useEffect } from "preact/hooks";
import { PencilIcon } from "./Icons";

interface ViewportsSectionProps {
  viewports: number[];
  onChange: (viewports: number[]) => void;
  disabled?: boolean;
}

// All available viewports - always visible
const ALL_VIEWPORTS = [1920, 1440, 1024, 768, 375];

export function ViewportsSection({ viewports, onChange, disabled }: ViewportsSectionProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<number[]>([...ALL_VIEWPORTS]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts and handle outside clicks
  useEffect(() => {
    if (editingIndex !== null && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingIndex]);

  const isSelected = (value: number) => viewports.includes(value);

  const handleToggle = (value: number) => {
    if (disabled || editingIndex !== null) return;

    if (isSelected(value)) {
      // Don't allow deselecting if it's the last one
      if (viewports.length > 1) {
        onChange(viewports.filter((v) => v !== value));
      }
    } else {
      // Add and sort by size (descending)
      const newViewports = [...viewports, value].sort((a, b) => b - a);
      onChange(newViewports);
    }
  };

  const handleEditClick = (e: Event, index: number) => {
    e.stopPropagation();
    if (disabled) return;
    setEditingIndex(index);
  };

  const handleEditChange = (index: number, value: string) => {
    const numericValue = value.replace(/\D/g, "");
    const newValues = [...editValues];
    newValues[index] = numericValue ? parseInt(numericValue, 10) : 0;
    setEditValues(newValues);
  };

  const handleEditBlur = (index: number) => {
    const oldValue = ALL_VIEWPORTS[index];
    const newValue = editValues[index];

    // Validate: must be > 0
    if (newValue <= 0) {
      // Reset to original
      const newValues = [...editValues];
      newValues[index] = oldValue;
      setEditValues(newValues);
      setEditingIndex(null);
      return;
    }

    // Validate: no duplicate viewport values
    const isDuplicate = editValues.some((v, i) => i !== index && v === newValue);
    if (isDuplicate) {
      // Reset to original
      const newValues = [...editValues];
      newValues[index] = oldValue;
      setEditValues(newValues);
      setEditingIndex(null);
      return;
    }

    // Update viewports if the old value was selected
    if (isSelected(oldValue) && newValue !== oldValue) {
      const newViewports = viewports.map((v) => (v === oldValue ? newValue : v)).sort((a, b) => b - a);
      onChange(newViewports);
    }

    setEditingIndex(null);
  };

  const handleKeyDown = (e: KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      handleEditBlur(index);
    } else if (e.key === "Escape") {
      // Reset and close
      const newValues = [...editValues];
      newValues[index] = ALL_VIEWPORTS[index];
      setEditValues(newValues);
      setEditingIndex(null);
    }
  };

  return (
    <div class="viewports-section">
      <div class="section-header">
        <span class="section-title">Viewports</span>
      </div>
      <div class="viewport-chips">
        {editValues.map((value, index) => {
          const selected = isSelected(value);
          const editing = editingIndex === index;

          return (
            <div
              key={index}
              class={`viewport-chip ${selected ? "viewport-chip-selected" : ""} ${editing ? "viewport-chip-editing" : ""}`}
              onClick={() => !editing && handleToggle(value)}
            >
              {editing ? (
                <input
                  ref={inputRef}
                  type="text"
                  class="viewport-edit-input"
                  value={value || ""}
                  onInput={(e) => handleEditChange(index, (e.target as HTMLInputElement).value)}
                  onBlur={() => handleEditBlur(index)}
                  onKeyDown={(e) => handleKeyDown(e as KeyboardEvent, index)}
                />
              ) : (
                <span class="viewport-value">{value}</span>
              )}
              <span class="viewport-unit">px</span>
              {!editing && !disabled && (
                <button
                  class="viewport-edit-btn"
                  onClick={(e) => handleEditClick(e, index)}
                  type="button"
                  aria-label="Edit viewport"
                >
                  <PencilIcon />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
