import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import styles from "./Renew.module.scss";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

/**
 * Renewal landing page. Reached from the expiry reminder email
 * (`/renew?uid=<figmaUserId>`).
 *
 * Security note (paid-by-victim mitigation): The `uid` query param controls
 * which account gets Pro after payment. An attacker could send a victim a
 * spoofed renewal link `…/renew?uid=ATTACKER_UID`, and if the victim auto-
 * redirected to checkout and paid, the attacker's account would be upgraded.
 * To prevent this, the page no longer auto-redirects — it displays the
 * target `uid` prominently and requires an explicit click. Legit users
 * recognize their own account ID (shown in the plugin's Plan modal);
 * spoofed links surface an unfamiliar id.
 *
 * The checkout URL is pre-fetched on mount so the click is instantaneous —
 * the friction added is just the visual confirmation step.
 */
type RenewPlan = "monthly" | "yearly";

const Renew = (): ReactElement => {
  const [params] = useSearchParams();
  const uid = params.get("uid");
  // Whitelist — anything other than "yearly" falls back to monthly so an
  // unrecognized or attacker-supplied `?plan=` value can only ever undercharge
  // the page copy, never display $0 or trigger a backend reject.
  const planParam = params.get("plan");
  const plan: RenewPlan = planParam === "yearly" ? "yearly" : "monthly";
  const priceLabel = plan === "yearly" ? "$144 USD" : "$16 USD";
  const cycleLabel = plan === "yearly" ? "365 days" : "30 days";
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    setIsLoading(true);
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/checkout/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ figmaUserId: uid, plan }),
        });
        const data = (await res.json()) as {
          checkoutUrl?: string;
          error?: string;
        };
        if (!res.ok || !data.checkoutUrl) {
          // Log the operator-detail error to the console for debugging,
          // but show a generic message to the user — `data.error` from the
          // backend may echo Flitt-side strings ("no such order", HTTP
          // status codes) that aren't actionable for an end user.
          console.error("[Renew] checkout creation failed:", data.error);
          throw new Error("");
        }
        if (!cancelled) setCheckoutUrl(data.checkoutUrl);
      } catch (err) {
        if (!cancelled) {
          // Generic message — see comment above.
          setError("We couldn't start the checkout. Please try again or email billing@web2wireframe.design.");
          // Operator-side trail.
          console.error("[Renew] error:", err);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, plan]);

  function handleConfirmRenew(): void {
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
    }
  }

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.card}>
          {!uid ? (
            <>
              <div className={styles.iconInfo}>?</div>
              <h1>This renewal link is incomplete</h1>
              <p>
                The link you used is missing your account ID. This usually
                means the URL was truncated when copied from your email.
              </p>
              <p>
                Open the Web2Wireframe plugin in Figma and use the{" "}
                <strong>Renew</strong> button in the Plan modal, or browse{" "}
                <Link to="/pricing">our pricing</Link>.
              </p>
              <p className={styles.subtle}>
                Need help? Email{" "}
                <a href="mailto:billing@web2wireframe.design">
                  billing@web2wireframe.design
                </a>
                .
              </p>
            </>
          ) : error ? (
            <>
              <div className={styles.iconError}>!</div>
              <h1>Renewal couldn't start</h1>
              <p>{error}</p>
            </>
          ) : (
            <>
              <h1>Renew Web2Wireframe Pro</h1>
              <p>
                You're about to renew Pro for the Figma account below.
                Verify that this account ID matches yours — you can see it
                in the plugin's Plan modal under <strong>Account ID</strong>.
              </p>
              <div className={styles.uidBox}>
                <div className={styles.uidLabel}>Renewing account</div>
                <div className={styles.uidValue}>{uid}</div>
              </div>
              <p>
                <strong>{priceLabel}</strong> · {cycleLabel} of unlimited
                imports · One-time payment, no auto-renewal.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmRenew}
                disabled={!checkoutUrl || isLoading}
              >
                {isLoading ? "Preparing checkout…" : "Continue to checkout"}
              </button>
              <p className={styles.subtle}>
                Not your account ID?{" "}
                <strong>Don't continue.</strong> This link may have been sent
                to the wrong person. Open the plugin in Figma and renew from
                there instead.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Renew;
