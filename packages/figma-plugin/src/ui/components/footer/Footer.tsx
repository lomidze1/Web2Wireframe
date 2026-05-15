/** @jsx h */
import { h } from "preact";
import { useEffect, useState, useCallback } from "preact/hooks";
import styles from "./Footer.css";
import { useConfig } from "../../shared/ConfigContext";
import { fetchMyLicense, type License } from "../../shared/licenseClient";
import { onQuotaExceeded } from "../../shared/quotaEvents";

interface FooterProps {
  onSettingsClick: () => void;
  onHelpClick: () => void;
  onPlanClick?: () => void;
  showExtension?: boolean;
  onExtensionClick?: () => void;
  onRebindFontsClick?: () => void;
  /**
   * Trigger to refetch license — increment from parent after Plan modal close
   * (e.g., when user just upgraded). Footer also refreshes on quota-exceeded.
   */
  licenseRefreshKey?: number;
}

interface PlanLabel {
  text: string;
  ariaLabel: string;
  nearLimit: boolean;
  isPro: boolean;
}

function deriveLabel(license: License | null): PlanLabel {
  if (!license) {
    return { text: "—", ariaLabel: "Plan: loading", nearLimit: false, isPro: false };
  }
  if (license.plan === "pro") {
    return {
      text: "Pro",
      ariaLabel: "Plan: Pro — open billing details",
      nearLimit: false,
      isPro: true,
    };
  }
  const used = license.usage.imports;
  const limit = license.limits.imports ?? 10;
  const remaining = Math.max(0, limit - used);
  return {
    text: `${used}/${limit}`,
    ariaLabel: `Plan: Free, ${used} of ${limit} imports used (${remaining} remaining)`,
    nearLimit: remaining <= 2,
    isPro: false,
  };
}

export default function Footer({
  onSettingsClick,
  onHelpClick,
  onPlanClick,
  showExtension = true,
  onExtensionClick,
  onRebindFontsClick,
  licenseRefreshKey = 0,
}: FooterProps) {
  const { config } = useConfig();
  const figmaUserId = config.figmaUserId;
  const [license, setLicense] = useState<License | null>(null);

  const refresh = useCallback(() => {
    if (!figmaUserId) return;
    fetchMyLicense(figmaUserId).then(
      (l) => setLicense(l),
      () => {
        /* swallow — pill shows "—" until next refresh */
      },
    );
  }, [figmaUserId]);

  // Fetch on mount + when figmaUserId becomes available + on parent refresh trigger
  useEffect(() => {
    refresh();
  }, [refresh, licenseRefreshKey]);

  // Refresh on quota-exceeded events (server told us we're at the limit)
  useEffect(() => {
    return onQuotaExceeded(() => refresh());
  }, [refresh]);

  const planLabel = deriveLabel(license);

  return (
    <footer class={styles.footerBar} role="contentinfo">
      <div class={styles.footerGroup}>
        <button
          type="button"
          class={styles.iconBtn}
          onClick={onSettingsClick}
          aria-label="Open settings"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button
          type="button"
          class={styles.iconBtn}
          onClick={onHelpClick}
          aria-label="Open help"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
      </div>

      <div class={styles.footerCenter}>
        {showExtension && onExtensionClick && (
          <button
            type="button"
            class={styles.extensionBtn}
            onClick={onExtensionClick}
          >
            Extension
          </button>
        )}
      </div>

      <div class={styles.footerGroup}>
        {onPlanClick && (
          <button
            type="button"
            class={`${styles.planPill} ${planLabel.nearLimit ? styles.planPillWarn : ""} ${planLabel.isPro ? styles.planPillPro : ""}`}
            onClick={onPlanClick}
            aria-label={planLabel.ariaLabel}
          >
            {planLabel.isPro && (
              <span class={styles.proDot} aria-hidden="true" />
            )}
            <span>{planLabel.text}</span>
          </button>
        )}
        {onRebindFontsClick && (
          <button
            type="button"
            class={styles.iconBtn}
            onClick={onRebindFontsClick}
            aria-label="Re-apply original fonts"
            title="Re-apply original fonts (after installing the .zip download)"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M5 6h10" />
              <path d="M10 6v12" />
              <path d="M16 4v4h-4" />
              <path d="M20 12a8 8 0 1 1-2.34-5.66L20 8" />
            </svg>
          </button>
        )}
      </div>
    </footer>
  );
}
