/** @jsx h */
/** @jsxFrag Fragment */
import { h, Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import styles from "../Modal.css";
import {
  fetchMyLicense,
  createCheckout,
  clearAuthToken,
  type License,
} from "../../../shared/licenseClient";
import { dispatchAuthExpired } from "../../../shared/authEvents";
import { useConfig } from "../../../shared/ConfigContext";
import { useModal } from "../../../hooks/useModal";

/**
 * True when the rendered error message recommends reconnecting — i.e. it came
 * from `httpErrorMessage(401|403)`. We only show the recovery button in that
 * case so quota/network/5xx errors don't get a misleading "Reconnect" CTA.
 */
function isAuthRelatedError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("session expired") || lower.includes("reconnect");
}

interface PlanProps {
  isOpen: boolean;
  onClose: () => void;
}

const POLL_INTERVAL_MS = 5_000;
const POLL_DURATION_MS = 5 * 60 * 1000; // give up after 5 minutes

/** Whole days remaining until `iso`, never negative. */
function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return 0;
  return Math.max(0, Math.ceil(ms / (24 * 60 * 60 * 1000)));
}

/** Countdown phrase: "today", "in 1 day", "in 25 days". */
function inDaysPhrase(iso: string): string {
  const days = daysUntil(iso);
  if (days <= 0) return "today";
  if (days === 1) return "in 1 day";
  return `in ${days} days`;
}

export default function Plan({ isOpen, onClose }: PlanProps) {
  const { config } = useConfig();
  const figmaUserId = config.figmaUserId;

  const [license, setLicense] = useState<License | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCheckoutPending, setIsCheckoutPending] = useState(false);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  // When window.open() returns null the browser blocked the popup. We surface
  // a clickable fallback link the user can click manually — the click is a
  // direct user gesture, which all popup blockers honor.
  const [blockedCheckoutUrl, setBlockedCheckoutUrl] = useState<string | null>(
    null,
  );

  const { modalRef } = useModal({ isOpen, onClose });

  const pollTimerRef = useRef<number | null>(null);
  const pollStartRef = useRef<number | null>(null);
  // Snapshot taken before opening checkout. Lets polling tell a first-time
  // upgrade (free → pro) apart from a renewal (pro, cycleEndsAt moves forward).
  const preCheckoutRef = useRef<{ plan: string; cycleEndsAt: string } | null>(
    null,
  );

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
    setCheckoutMessage("Opening secure checkout…");
    setBlockedCheckoutUrl(null);
    preCheckoutRef.current = license
      ? { plan: license.plan, cycleEndsAt: license.cycleEndsAt }
      : null;
    try {
      const { checkoutUrl } = await createCheckout(figmaUserId);
      // window.open returns null when the popup is blocked, e.g. because the
      // call awaited the API response and lost the user-gesture context.
      // Render an explicit click-to-open link rather than appearing to hang.
      const opened = window.open(checkoutUrl, "_blank");
      if (!opened) {
        setBlockedCheckoutUrl(checkoutUrl);
        setCheckoutMessage(
          "Your browser blocked the checkout window — click the link below to continue.",
        );
      } else {
        setCheckoutMessage(
          "Complete payment in your browser. We'll detect it automatically.",
        );
      }
      startPolling();
    } catch (err) {
      setCheckoutMessage(null);
      setError(err instanceof Error ? err.message : "Checkout failed");
      setIsCheckoutPending(false);
    }
  }

  function handleBlockedLinkClick(): void {
    // Direct click = fresh user gesture. The popup blocker is required to
    // honor this; we hide the fallback once they've launched it.
    setBlockedCheckoutUrl(null);
    setCheckoutMessage(
      "Complete payment in your browser. We'll detect it automatically.",
    );
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
        const pre = preCheckoutRef.current;
        // First-time upgrade: plan flipped free → pro.
        const upgraded = fresh.plan === "pro" && pre?.plan !== "pro";
        // Renewal: already Pro, cycleEndsAt extended by the new purchase.
        const renewed =
          fresh.plan === "pro" &&
          pre?.plan === "pro" &&
          new Date(fresh.cycleEndsAt).getTime() >
            new Date(pre.cycleEndsAt).getTime();
        if (upgraded || renewed) {
          window.clearInterval(pollTimerRef.current!);
          pollTimerRef.current = null;
          setLicense(fresh);
          setIsCheckoutPending(false);
          setCheckoutMessage(
            renewed ? "🎉 Pro extended — thanks!" : "🎉 Welcome to Pro!",
          );
        }
      } catch {
        // Silent — keep polling.
      }
    }, POLL_INTERVAL_MS);
  }

  // ------------------------------------------------------------------
  // Derived display
  // ------------------------------------------------------------------
  const planLabel = license?.plan ? license.plan.toUpperCase() : "—";
  const statusLabel = license?.status
    ? license.status[0].toUpperCase() + license.status.slice(1)
    : "—";
  const isPro = license?.plan === "pro";
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
          <div class={styles.planSummary}>
            <span class={styles.planLabel}>Current plan</span>
            <span
              class={`${styles.planBadge} ${isPro ? styles.planBadgePro : ""}`}
            >
              {planLabel}
            </span>
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
            <Fragment>
              <div class={styles.planError} role="alert" aria-live="assertive">
                {error}
              </div>
              {isAuthRelatedError(error) && (
                <button
                  type="button"
                  class={styles.planCtaLink}
                  onClick={() => {
                    // Same path a real 401 takes: clear the token and let
                    // ConnectionGate flip the app to ConnectFigma. Unmounting
                    // this modal in the process is the desired outcome.
                    clearAuthToken();
                    dispatchAuthExpired();
                  }}
                >
                  Reconnect Figma
                </button>
              )}
            </Fragment>
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
              {isPro && (
                <div class={styles.planMetaRow}>
                  <span>Access expires</span>
                  <span class={styles.planMetaValue}>
                    {inDaysPhrase(license.cycleEndsAt)}
                  </span>
                </div>
              )}
              {!isPro && (
                <div class={styles.planMetaRow}>
                  <span>Cycle resets</span>
                  <span class={styles.planMetaValue}>
                    {inDaysPhrase(license.cycleEndsAt)}
                  </span>
                </div>
              )}
              <div class={styles.planMetaRow}>
                <span>Account ID</span>
                <span class={styles.planMetaValue}>{license.figmaUserId}</span>
              </div>
            </div>
          )}

          {checkoutMessage && (
            <div class={styles.planNotice} role="status" aria-live="polite">
              {checkoutMessage}
            </div>
          )}

          {blockedCheckoutUrl && (
            <a
              href={blockedCheckoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              class={styles.planCtaLink}
              onClick={handleBlockedLinkClick}
              data-testid="checkout-fallback-link"
            >
              Open Flitt checkout →
            </a>
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
                  <div class={styles.planCardHeader}>PRO — $16 / 30 days</div>
                  <ul class={styles.planList}>
                    <li class={styles.planListItem}>Unlimited imports</li>
                    <li class={styles.planListItem}>
                      Full colors, fonts, and all viewports
                    </li>
                    <li class={styles.planListItem}>Real text content</li>
                    <li class={styles.planListItem}>Styles & assets included</li>
                    <li class={styles.planListItem}>Priority email support</li>
                    <li class={styles.planListItem}>
                      One-time payment — you're charged once, no auto-renewal
                    </li>
                  </ul>
                  <button
                    type="button"
                    class={`${styles.planCardBtn} ${styles.planCardBtnPro}`}
                    onClick={handleGetPro}
                    disabled={!figmaUserId || isCheckoutPending}
                  >
                    {isCheckoutPending ? "Waiting for payment…" : "Get Pro"}
                  </button>
                  <p class={styles.planTrustNote}>
                    Secure checkout by Flitt · Apple Pay, Google Pay & all
                    major cards
                  </p>
                </div>
              </div>
            </>
          )}

          {isPro && license && daysUntil(license.cycleEndsAt) <= 7 && (
            <Fragment>
              <button
                type="button"
                class={styles.planCtaLink}
                onClick={handleGetPro}
                disabled={!figmaUserId || isCheckoutPending}
              >
                {isCheckoutPending
                  ? "Waiting for payment…"
                  : "Extend Pro — +30 days for $16"}
              </button>
              <p class={styles.planTrustNote}>
                Buying now stacks 30 days onto your remaining time — no days
                are lost.
              </p>
            </Fragment>
          )}
        </div>
      </div>
    </div>
  );
}
