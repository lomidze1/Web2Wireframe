import { CrownIcon, HelpIcon } from "./Icons";

interface FooterProps {
  onPlanClick: () => void;
  onHelpClick: () => void;
}

export function Footer({ onPlanClick, onHelpClick }: FooterProps) {
  return (
    <footer class="popup-footer">
      <button
        class="footer-btn"
        onClick={onPlanClick}
        type="button"
        aria-label="View Plan"
        title="View Plan"
      >
        <CrownIcon />
      </button>
      <button
        class="footer-btn"
        onClick={onHelpClick}
        type="button"
        aria-label="Help"
        title="Help"
      >
        <HelpIcon />
      </button>
    </footer>
  );
}
