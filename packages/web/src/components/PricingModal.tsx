import { useEffect, useRef, useState, type ReactElement } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useModalA11y } from "../hooks/useModalA11y";
import styles from "./PricingModal.module.scss";

type ProTier = "monthly" | "yearly";

interface PricingModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * Pre-select a tier. Pricing page passes its on-page toggle so the modal
   * reflects what the user just clicked. The sessionStorage restore (post-
   * OAuth) overrides this when present.
   */
  initialTier?: ProTier;
}

const PRICING_RESTORE_KEY = "w2w_pricing_modal_pending";

interface PendingState {
  tier: ProTier;
  ts: number;
}

/**
 * Pricing modal — toggle Monthly ($16) vs Yearly ($144), then redirect to
 * Flitt checkout. One-time payment model; no auto-renewal.
 *
 * Auth gate: if the user isn't logged in, save the chosen tier to
 * sessionStorage and kick off Figma OAuth. The provider rehydrates on
 * return; the consumer (Header/Footer/Home/Pricing) reads the saved tier
 * and re-opens the modal pre-selected.
 */
const PricingModal = ({
  open,
  onClose,
  initialTier,
}: PricingModalProps): ReactElement | null => {
  const { user, login } = useAuth();
  const [tier, setTier] = useState<ProTier>(initialTier ?? "yearly");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // P5-A11Y-3: dialog container ref for the focus-trap hook.
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(open, onClose, dialogRef);

  // On open: apply (in order) sessionStorage restore > caller's initialTier
  // > current state. sessionStorage wins because it carries the user's
  // pre-OAuth intent, which we don't want to silently overwrite.
  useEffect(() => {
    if (!open) return;
    let restored: ProTier | null = null;
    try {
      const raw = sessionStorage.getItem(PRICING_RESTORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as PendingState | null;
        if (parsed && Date.now() - parsed.ts <= 10 * 60 * 1000) {
          if (parsed.tier === "monthly" || parsed.tier === "yearly") {
            restored = parsed.tier;
          }
        }
        sessionStorage.removeItem(PRICING_RESTORE_KEY);
      }
    } catch {
      sessionStorage.removeItem(PRICING_RESTORE_KEY);
    }
    if (restored) {
      setTier(restored);
    } else if (initialTier) {
      setTier(initialTier);
    }
  }, [open, initialTier]);

  if (!open) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleCheckout = async () => {
    setError(null);

    // Gate: must be logged in to create a checkout (figmaUserId is the key).
    if (!user) {
      try {
        sessionStorage.setItem(
          PRICING_RESTORE_KEY,
          JSON.stringify({ tier, ts: Date.now() } satisfies PendingState),
        );
      } catch {
        // sessionStorage can throw in private mode; fall through and the
        // user will just see the modal in its default state after OAuth.
      }
      login();
      return;
    }

    setSubmitting(true);
    try {
      const returnUrl = `${window.location.origin}/checkout/success`;
      const response = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          figmaUserId: user.figmaUserId,
          plan: tier,
          returnUrl,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { checkoutUrl?: string; error?: string }
        | null;
      if (!response.ok || !data?.checkoutUrl) {
        setError(data?.error ?? "Checkout failed. Please try again.");
        setSubmitting(false);
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={handleOverlayClick} role="presentation">
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Upgrade to Pro"
      >
        <div className={styles.header}>
          <h2>Upgrade to Pro</h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className={styles.content}>
          <p className={styles.intro}>
            Unlimited imports, full styling, real text content, and assets.
            One-time payment — no auto-renewal.
          </p>

          <div className={styles.tierToggle} role="tablist" aria-label="Plan duration">
            <span className={styles.saveTag} aria-hidden="true">Save 25%</span>
            <button
              type="button"
              role="tab"
              aria-selected={tier === "monthly"}
              className={`${styles.tierBtn} ${tier === "monthly" ? styles.tierBtnActive : ""}`}
              onClick={() => setTier("monthly")}
            >
              Monthly
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tier === "yearly"}
              className={`${styles.tierBtn} ${tier === "yearly" ? styles.tierBtnActive : ""}`}
              onClick={() => setTier("yearly")}
            >
              Yearly
            </button>
          </div>

          <div className={styles.priceCard}>
            {tier === "monthly" ? (
              <>
                <div className={styles.price}>$16 <span>/ 30 days</span></div>
                <div className={styles.priceNote}>Single $16 payment for 30 days of Pro.</div>
              </>
            ) : (
              <>
                <div className={styles.price}>$144 <span>/ 365 days</span></div>
                <div className={styles.priceNote}>
                  Single $144 payment for a full year — 25% off vs monthly.
                </div>
              </>
            )}
          </div>

          {!user && (
            <p className={styles.authNote}>
              You'll log in with Figma first, then continue to secure checkout.
            </p>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <button
            type="button"
            className="btn btn-primary"
            onClick={handleCheckout}
            disabled={submitting}
          >
            {submitting
              ? "Opening checkout…"
              : user
                ? "Continue to checkout"
                : "Log in with Figma to continue"}
          </button>

          <p className={styles.trustNote}>
            Secure checkout by Flitt (PCI-DSS Level 1) · Apple Pay, Google
            Pay & all major cards
          </p>
        </div>
      </div>
    </div>
  );
};

export default PricingModal;
