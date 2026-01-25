/** @jsx h */
import { h } from "preact";
import { useEffect, useState } from "preact/hooks";
import styles from "../Modal.css";
import { fetchMyLicense, type License } from "../../../shared/licenseClient";

interface PlanProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function Plan({ isOpen, onClose }: PlanProps) {
  if (!isOpen) return null;

  const [license, setLicense] = useState<License | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    fetchMyLicense(controller.signal)
      .then((data) => {
        setLicense(data);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        const message =
          err instanceof Error ? err.message : "Failed to load license";
        setError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [isOpen]);

  const planLabel = license?.plan ? license.plan.toUpperCase() : "—";
  const statusLabel = license?.status
    ? license.status[0].toUpperCase() + license.status.slice(1)
    : "—";

  return (
    <div class={styles.modalOverlay} onClick={onClose}>
      <div class={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div class={styles.modalHeader}>
          <span>Your Plan</span>
          <button class={styles.modalClose} onClick={onClose}>
            ×
          </button>
        </div>
        <div class={styles.modalContent}>
          <div class={styles.planSummary}>
            <span class={styles.planLabel}>Current plan</span>
            <span class={styles.planBadge}>{planLabel}</span>
          </div>
          {isLoading && <div class={styles.planNotice}>Loading license…</div>}
          {error && <div class={styles.planError}>{error}</div>}
          {license && (
            <div class={styles.planMeta}>
              <div class={styles.planMetaRow}>
                <span>Status</span>
                <span class={styles.planMetaValue}>{statusLabel}</span>
              </div>
              <div class={styles.planMetaRow}>
                <span>Limits</span>
                <span class={styles.planMetaValue}>
                  {license.limits.importsPerDay}/day imports ·{" "}
                  {license.limits.aiGenerationsPerDay}/day AI
                </span>
              </div>
            </div>
          )}
          <div class={styles.planSectionTitle}>
            <span class={styles.planSectionLine}></span>
            <span>Upgrade your plan</span>
            <span class={styles.planSectionLine}></span>
          </div>
          <div class={styles.planCards}>
            <div class={styles.planCard}>
              <div class={styles.planCardHeader}>PLUS - Full Control</div>
              <ul class={styles.planList}>
                <li class={styles.planListItem}>
                  Full colors, fonts, and viewports
                </li>
                <li class={styles.planListItem}>Real text content</li>
                <li class={styles.planListItem}>No AI generations</li>
                <li class={styles.planListItem}>No library access</li>
              </ul>
              <a
                class={styles.planCardBtn}
                href="https://www.web2wireframe.design/pricing"
                target="_blank"
                rel="noopener noreferrer"
              >
                Upgrade to Plus
              </a>
            </div>
            <div class={`${styles.planCard} ${styles.planCardPro}`}>
              <div class={styles.planCardHeader}>PRO - AI & Library</div>
              <ul class={styles.planList}>
                <li class={styles.planListItem}>Everything in Plus</li>
                <li class={styles.planListItem}>AI-powered generation</li>
                <li class={styles.planListItem}>Full library access</li>
              </ul>
              <a
                class={`${styles.planCardBtn} ${styles.planCardBtnPro}`}
                href="https://www.web2wireframe.design/pricing"
                target="_blank"
                rel="noopener noreferrer"
              >
                Upgrade to Pro
              </a>
            </div>
          </div>
          <a
            class={styles.planCtaLink}
            href="https://www.web2wireframe.design/pricing"
            target="_blank"
            rel="noopener noreferrer"
          >
            View pricing & plans
          </a>
        </div>
      </div>
    </div>
  );
}
