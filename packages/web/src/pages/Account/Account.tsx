import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import styles from "./Account.module.scss";

interface Subscription {
  flittOrderId: string;
  activatedAt: string;
  nextBillingAt: string;
  canceledAt: string | null;
  lastFailedAt: string | null;
  failureCount: number;
  autoRenew: boolean;
}

interface AccountLicense {
  figmaUserId: string;
  email: string | null;
  plan: "free" | "pro";
  status: "active" | "canceled" | "expired";
  cycleStartedAt: string;
  cycleEndsAt: string;
  usage: { imports: number; periodStartedAt: string };
  limits: { imports: number | null };
  subscription: Subscription | null;
}

// Relative URLs by design — nginx proxies /api/* to the backend in
// production (see packages/web/nginx.conf), and the Vite dev server
// proxies the same paths (see vite.config.ts). An absolute URL would
// violate the page's CSP (`connect-src 'self'`).

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

const Account = (): ReactElement => {
  const [params] = useSearchParams();
  const figmaUserId = params.get("fid");
  const token = params.get("t");

  const [license, setLicense] = useState<AccountLicense | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!figmaUserId || !token) {
      // Handled by the dedicated empty-state below — don't surface as an
      // error toast.
      setIsLoading(false);
      return;
    }
    fetch(`/api/license/by-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ figmaUserId, token }),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`License request failed (${res.status})`);
        return (await res.json()) as AccountLicense;
      })
      .then(setLicense)
      .catch((err: Error) =>
        setError(err.message || "Could not load license"),
      )
      .finally(() => setIsLoading(false));
  }, [figmaUserId, token]);

  const failureCount = license?.subscription?.failureCount ?? 0;
  const failureSeverity = getFailureSeverity(failureCount);
  const failureSeverityClass = {
    info: styles.failedPaymentBannerInfo,
    warning: styles.failedPaymentBannerWarning,
    urgent: styles.failedPaymentBannerUrgent,
  }[failureSeverity];

  // Dedicated empty state when this page is reached without the plugin
  // signing the link — the Account view requires a verified HMAC token.
  if (!figmaUserId || !token) {
    return (
      <div className={styles.page}>
        <div className="container">
          <div className={styles.card}>
            <h1>Open from the Figma plugin</h1>
            <p>
              This page shows your Pro plan details, but it needs a verified
              link from the Web2Wireframe plugin to load your account. Open
              the plugin in Figma — your plan info lives in the Plan modal.
            </p>
            <p>
              Just looking for pricing? Visit{" "}
              <Link to="/pricing">our pricing page</Link>.
            </p>
            <p className={styles.subtle}>
              Need help? Email{" "}
              <a href="mailto:billing@web2wireframe.design">
                billing@web2wireframe.design
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.card}>
          {license && failureCount > 0 && (
            <div
              data-severity={failureSeverity}
              className={`${styles.failedPaymentBanner} ${failureSeverityClass}`}
            >
              <div>
                ⚠️ Last payment attempt failed ({failureCount}{" "}
                {failureCount === 1 ? "attempt" : "attempts"}).
              </div>
              <div>
                Update your payment method by {formatDate(license.cycleEndsAt)}{" "}
                to keep Pro access.
              </div>
            </div>
          )}

          <h1>Your Pro plan</h1>

          {isLoading && <p>Loading…</p>}
          {error && <p className={styles.error}>{error}</p>}

          {license && (
            <div className={styles.summary}>
              <div className={styles.row}>
                <span>Plan</span>
                <span className={styles.value}>
                  {license.plan.toUpperCase()}
                </span>
              </div>
              <div className={styles.row}>
                <span>Status</span>
                <span className={styles.value}>
                  {license.status[0].toUpperCase() + license.status.slice(1)}
                </span>
              </div>
              {license.email && (
                <div className={styles.row}>
                  <span>Billing email</span>
                  <span className={styles.value}>{license.email}</span>
                </div>
              )}
              {license.subscription && (
                <div className={styles.row}>
                  <span>Pro expires</span>
                  <span className={styles.value}>
                    {formatDate(license.subscription.nextBillingAt)}
                  </span>
                </div>
              )}
            </div>
          )}

          {license?.plan === "pro" && license.status === "active" && (
            <p className={styles.subtle}>
              Pro is a one-time purchase — there's no auto-renewal and
              nothing to cancel. Your Pro access ends on the date above.
              Buy another 30 days anytime from the plugin.
            </p>
          )}

          <p className={styles.subtle}>
            Questions? Email{" "}
            <a href="mailto:billing@web2wireframe.design">
              billing@web2wireframe.design
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
};

export default Account;
