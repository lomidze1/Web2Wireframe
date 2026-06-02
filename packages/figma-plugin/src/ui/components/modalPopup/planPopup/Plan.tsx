/** @jsx h */
/** @jsxFrag Fragment */
import { h, Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import styles from "../Modal.css";
import {
  fetchMyLicense,
  createCheckout,
  clearAuthToken,
} from "../../../shared/licenseClient";
import { dispatchAuthExpired } from "../../../shared/authEvents";
import { useConfig } from "../../../shared/ConfigContext";
import { useLicense } from "../../../shared/LicenseContext";
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

  // License is preloaded + cached by LicenseProvider on plugin startup, so
  // the modal renders with data immediately on first open (no blink). The
  // context also handles refresh after quota-exceeded events and exposes a
  // refresh() we can call after a successful checkout.
  const {
    license,
    isLoading: isLicenseLoading,
    error: licenseError,
    refresh: refreshLicense,
  } = useLicense();
  // Local error is reserved for actions that happen inside this modal
  // (handleGetPro). License fetch errors come from context.
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

  const displayError = error ?? licenseError;

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
  async function handleGetPro(
    duration: "monthly" | "yearly" = "monthly",
  ): Promise<void> {
    if (!figmaUserId || isCheckoutPending) return;
    setIsCheckoutPending(true);
    setCheckoutMessage("Opening secure checkout…");
    setBlockedCheckoutUrl(null);
    preCheckoutRef.current = license
      ? { plan: license.plan, cycleEndsAt: license.cycleEndsAt }
      : null;
    try {
      const { checkoutUrl } = await createCheckout(figmaUserId, duration);
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
          // Push the just-confirmed license into the shared context so the
          // footer pill, expiry banner, and any other consumer update too —
          // not just this modal.
          void refreshLicense();
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
  // For Pro, append the tier — "PRO · YEARLY" / "PRO · MONTHLY" — so the
  // user can tell at a glance which renewal cycle they're on. Falls back to
  // bare "PRO" when subscription metadata is missing (e.g., legacy license
  // documents written before `lastDuration` was persisted).
  const planLabel = (() => {
    if (!license?.plan) return "—";
    const base = license.plan.toUpperCase();
    if (license.plan !== "pro") return base;
    const tier = license.subscription?.lastDuration;
    if (tier === "yearly") return `${base} · YEARLY`;
    if (tier === "monthly") return `${base} · MONTHLY`;
    return base;
  })();
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
          {!license && isLicenseLoading && (
            <div class={styles.planNotice} role="status" aria-live="polite">
              Loading license…
            </div>
          )}
          {displayError && (
            <Fragment>
              <div class={styles.planError} role="alert" aria-live="assertive">
                {displayError}
              </div>
              {isAuthRelatedError(displayError) && (
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
                <div class={styles.planCard}>
                  <div class={styles.planCardHeader}>Monthly · $16</div>
                  <p class={styles.planCardSubhead}>Pro for 30 days</p>
                  <ul class={styles.planList}>
                    <li class={styles.planListItem}>Unlimited imports</li>
                    <li class={styles.planListItem}>
                      Full colors, fonts, all viewports
                    </li>
                    <li class={styles.planListItem}>Real text content</li>
                    <li class={styles.planListItem}>
                      Styles &amp; assets included
                    </li>
                  </ul>
                  <button
                    type="button"
                    class={styles.planCardBtn}
                    onClick={() => handleGetPro("monthly")}
                    disabled={!figmaUserId || isCheckoutPending}
                    aria-label="Get Pro — Monthly $16 for 30 days"
                    data-testid="get-pro-monthly"
                  >
                    {isCheckoutPending ? "Waiting for payment…" : "Get Pro"}
                  </button>
                </div>

                <div class={`${styles.planCard} ${styles.planCardPro}`}>
                  <span class={styles.planSavingsBadge}>Save 25%</span>
                  <div class={styles.planCardHeader}>Yearly · $144</div>
                  <p class={styles.planCardSubhead}>
                    Pro for 365 days · just $12/mo
                  </p>
                  <ul class={styles.planList}>
                    <li class={styles.planListItem}>Everything in Monthly</li>
                    <li class={styles.planListItem}>Priority email support</li>
                    <li class={styles.planListItem}>
                      Lock in pricing for the whole year
                    </li>
                    <li class={styles.planListItem}>
                      One-time payment — no auto-renewal
                    </li>
                  </ul>
                  <button
                    type="button"
                    class={`${styles.planCardBtn} ${styles.planCardBtnPro}`}
                    onClick={() => handleGetPro("yearly")}
                    disabled={!figmaUserId || isCheckoutPending}
                    aria-label="Get Pro — Yearly $144 for 365 days"
                    data-testid="get-pro-yearly"
                  >
                    {isCheckoutPending ? "Waiting for payment…" : "Get Pro"}
                  </button>
                </div>
              </div>
              <p class={styles.planTrustNote}>
                Secure checkout by Flitt · Apple Pay, Google Pay &amp; all
                major cards
              </p>
              <p class={styles.planTrustNote}>
                By purchasing, you agree to our{" "}
                <a
                  href="https://web2wireframe.design/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Terms
                </a>{" "}
                and{" "}
                <a
                  href="https://web2wireframe.design/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Privacy Policy
                </a>
                .
              </p>
            </>
          )}

          {isPro && license?.subscription?.lastDuration === "monthly" && (
            <Fragment>
              <button
                type="button"
                class={styles.planCtaLink}
                onClick={() => handleGetPro("yearly")}
                disabled={!figmaUserId || isCheckoutPending}
                data-testid="upgrade-to-yearly"
              >
                {isCheckoutPending
                  ? "Waiting for payment…"
                  : "Upgrade to Yearly — Save 25% ($144 / 365 days)"}
              </button>
              <p class={styles.planTrustNote}>
                Adds 365 days onto your remaining time — no days are lost.
              </p>
            </Fragment>
          )}

          {isPro && license && daysUntil(license.cycleEndsAt) <= 7 && (
            <Fragment>
              <button
                type="button"
                class={styles.planCtaLink}
                onClick={() => handleGetPro("monthly")}
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
