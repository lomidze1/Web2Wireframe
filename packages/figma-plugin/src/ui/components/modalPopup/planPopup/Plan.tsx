/** @jsx h */
/** @jsxFrag Fragment */
import { h, Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import styles from "../Modal.css";
import {
  fetchMyLicense,
  createCheckout,
  issueCancelToken,
  type License,
} from "../../../shared/licenseClient";
import { useConfig } from "../../../shared/ConfigContext";
import { useModal } from "../../../hooks/useModal";

interface PlanProps {
  isOpen: boolean;
  onClose: () => void;
}

const POLL_INTERVAL_MS = 5_000;
const POLL_DURATION_MS = 5 * 60 * 1000; // give up after 5 minutes
const WEBSITE_BASE_URL = "https://www.web2wireframe.design";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function getFailureSeverity(count: number): "info" | "warning" | "urgent" {
  if (count >= 4) return "urgent";
  if (count >= 2) return "warning";
  return "info";
}

export default function Plan({ isOpen, onClose }: PlanProps) {
  const { config } = useConfig();
  const figmaUserId = config.figmaUserId;

  const [license, setLicense] = useState<License | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckoutPending, setIsCheckoutPending] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [isCancelPending, setIsCancelPending] = useState(false);

  const { modalRef } = useModal({ isOpen, onClose });

  const pollTimerRef = useRef<number | null>(null);
  const pollStartRef = useRef<number | null>(null);

  // ------------------------------------------------------------------
  // Initial load
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen || !figmaUserId) return;

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    fetchMyLicense(figmaUserId, controller.signal)
      .then(setLicense)
      .catch((err) => {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Failed to load license");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [isOpen, figmaUserId]);

  // ------------------------------------------------------------------
  // Stop polling on unmount or close
  // ------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (pollTimerRef.current !== null) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  // ------------------------------------------------------------------
  // Get Pro → open checkout + start polling
  // ------------------------------------------------------------------
  async function handleGetPro(): Promise<void> {
    if (!figmaUserId || isCheckoutPending) return;
    setIsCheckoutPending(true);
    setCheckoutMessage("Opening Flitt checkout…");
    try {
      const { checkoutUrl } = await createCheckout(figmaUserId);
      window.open(checkoutUrl, "_blank");
      setCheckoutMessage("Complete payment in your browser. We'll detect it automatically.");
      startPolling();
    } catch (err) {
      setCheckoutMessage(null);
      setError(err instanceof Error ? err.message : "Checkout failed");
      setIsCheckoutPending(false);
    }
  }

  function startPolling(): void {
    pollStartRef.current = Date.now();
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
    }
    pollTimerRef.current = window.setInterval(async () => {
      if (!figmaUserId) return;
      const elapsed = Date.now() - (pollStartRef.current ?? Date.now());
      if (elapsed > POLL_DURATION_MS) {
        window.clearInterval(pollTimerRef.current!);
        pollTimerRef.current = null;
        setIsCheckoutPending(false);
        setCheckoutMessage(
          "We didn't detect a payment yet. Reopen this modal once it's done.",
        );
        return;
      }
      try {
        const fresh = await fetchMyLicense(figmaUserId);
        if (fresh.plan === "pro" && fresh.status !== "expired") {
          window.clearInterval(pollTimerRef.current!);
          pollTimerRef.current = null;
          setLicense(fresh);
          setIsCheckoutPending(false);
          setCheckoutMessage("🎉 Welcome to Pro!");
        }
      } catch {
        // Silent — keep polling.
      }
    }, POLL_INTERVAL_MS);
  }

  // ------------------------------------------------------------------
  // Manage Subscription → issue token + open Account page
  // ------------------------------------------------------------------
  async function handleManageSubscription(): Promise<void> {
    if (!figmaUserId || isCancelPending) return;
    setIsCancelPending(true);
    try {
      const { token } = await issueCancelToken(figmaUserId);
      const url =
        `${WEBSITE_BASE_URL}/account?fid=${encodeURIComponent(figmaUserId)}` +
        `&t=${encodeURIComponent(token)}`;
      window.open(url, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open billing");
    } finally {
      setIsCancelPending(false);
    }
  }

  // ------------------------------------------------------------------
  // Derived display
  // ------------------------------------------------------------------
  const planLabel = license?.plan ? license.plan.toUpperCase() : "—";
  const statusLabel = license?.status
    ? license.status[0].toUpperCase() + license.status.slice(1)
    : "—";
  const isPro = license?.plan === "pro";
  const failureCount = license?.subscription?.failureCount ?? 0;
  const failureSeverity = getFailureSeverity(failureCount);
  const failureSeverityClass = {
    info: styles.planFailedPaymentBannerInfo,
    warning: styles.planFailedPaymentBannerWarning,
    urgent: styles.planFailedPaymentBannerUrgent,
  }[failureSeverity];
  const limitText =
    license == null
      ? ""
      : license.limits.imports === null
        ? `${license.usage.imports} imports this cycle (unlimited)`
        : `${license.usage.imports}/${license.limits.imports} imports this month`;

  if (!isOpen) return null;

  return (
    <div class={styles.modalOverlay} onClick={onClose}>
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-title"
        class={styles.modal}
        onClick={(e) => e.stopPropagation()}
      >
        <div class={styles.modalHeader}>
          <h2 id="plan-title" class={styles.modalTitle}>Your Plan</h2>
          <button
            type="button"
            class={styles.modalClose}
            onClick={onClose}
            aria-label="Close plan"
          >
            ×
          </button>
        </div>
        <div class={styles.modalContent}>
          {license && failureCount > 0 && (
            <div
              data-severity={failureSeverity}
              class={`${styles.planFailedPaymentBanner} ${failureSeverityClass}`}
            >
              <div>
                ⚠️ Last payment attempt failed ({failureCount}{" "}
                {failureCount === 1 ? "attempt" : "attempts"}).
              </div>
              <div>
                Update your payment method by {formatDate(license.cycleEndsAt)}{" "}
                to keep Pro access. Use "Manage Subscription" below.
              </div>
            </div>
          )}
          <div class={styles.planSummary}>
            <span class={styles.planLabel}>Current plan</span>
            <span class={styles.planBadge}>{planLabel}</span>
          </div>

          {!figmaUserId && (
            <div class={styles.planNotice} role="status" aria-live="polite">
              Identifying Figma user…
            </div>
          )}
          {isLoading && (
            <div class={styles.planNotice} role="status" aria-live="polite">
              Loading license…
            </div>
          )}
          {error && (
            <div class={styles.planError} role="alert" aria-live="assertive">
              {error}
            </div>
          )}

          {license && (
            <div class={styles.planMeta}>
              <div class={styles.planMetaRow}>
                <span>Status</span>
                <span class={styles.planMetaValue}>{statusLabel}</span>
              </div>
              {isPro && license.email && (
                <div class={styles.planMetaRow}>
                  <span>Billing email</span>
                  <span class={styles.planMetaValue}>{license.email}</span>
                </div>
              )}
              <div class={styles.planMetaRow}>
                <span>Usage</span>
                <span class={styles.planMetaValue}>{limitText}</span>
              </div>
              {isPro && license.subscription && (
                <div class={styles.planMetaRow}>
                  <span>{license.status === "canceled" ? "Access until" : "Next billing"}</span>
                  <span class={styles.planMetaValue}>
                    {formatDate(license.subscription.nextBillingAt)}
                  </span>
                </div>
              )}
              {!isPro && (
                <div class={styles.planMetaRow}>
                  <span>Cycle resets</span>
                  <span class={styles.planMetaValue}>
                    {formatDate(license.cycleEndsAt)}
                  </span>
                </div>
              )}
            </div>
          )}

          {checkoutMessage && (
            <div class={styles.planNotice} role="status" aria-live="polite">
              {checkoutMessage}
            </div>
          )}

          {!isPro && (
            <>
              <div class={styles.planSectionTitle}>
                <span class={styles.planSectionLine}></span>
                <span>Upgrade your plan</span>
                <span class={styles.planSectionLine}></span>
              </div>
              <div class={styles.planCards}>
                <div class={`${styles.planCard} ${styles.planCardPro}`}>
                  <div class={styles.planCardHeader}>PRO — $16/month</div>
                  <ul class={styles.planList}>
                    <li class={styles.planListItem}>Unlimited imports</li>
                    <li class={styles.planListItem}>
                      Full colors, fonts, and all viewports
                    </li>
                    <li class={styles.planListItem}>Real text content</li>
                    <li class={styles.planListItem}>Styles & assets included</li>
                    <li class={styles.planListItem}>Priority email support</li>
                  </ul>
                  <button
                    type="button"
                    class={`${styles.planCardBtn} ${styles.planCardBtnPro}`}
                    onClick={handleGetPro}
                    disabled={!figmaUserId || isCheckoutPending}
                  >
                    {isCheckoutPending ? "Waiting for payment…" : "Get Pro"}
                  </button>
                </div>
              </div>
            </>
          )}

          {isPro && (
            <button
              type="button"
              class={styles.planCtaLink}
              onClick={handleManageSubscription}
              disabled={!figmaUserId || isCancelPending}
            >
              {isCancelPending ? "Opening billing…" : "Manage Subscription"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
