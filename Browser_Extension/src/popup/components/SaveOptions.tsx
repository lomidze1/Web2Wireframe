import { SaveIcon, FigmaIcon } from "./Icons";

interface SaveOptionsProps {
  saveOption: "local" | "figma";
  onChange: (option: "local" | "figma") => void;
  disabled?: boolean;
}

export function SaveOptions({ saveOption, onChange, disabled }: SaveOptionsProps) {
  return (
    <div class="save-options">
      <span class="section-title">Save to</span>
      <div class="save-buttons">
        <button
          class={`save-btn ${saveOption === "local" ? "save-btn-active" : ""}`}
          onClick={() => onChange("local")}
          disabled={disabled}
          type="button"
        >
          <span class="save-btn-icon">
            <SaveIcon />
          </span>
          <span>Save locally</span>
        </button>
        <button
          class="save-btn save-btn-disabled"
          disabled
          type="button"
          title="Coming soon"
        >
          <span class="save-btn-icon">
            <FigmaIcon />
          </span>
          <span>Send to Figma</span>
          <span class="coming-soon-badge">Soon</span>
        </button>
      </div>
    </div>
  );
}
