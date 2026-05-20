import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
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

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

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
  const [cancelStatus, setCancelStatus] = useState<
    "idle" | "confirming" | "submitting" | "success"
  >("idle");

  useEffect(() => {
    if (!figmaUserId || !token) {
      setError("Missing or invalid link. Open this page from the Figma plugin.");
      setIsLoading(false);
      return;
    }
    fetch(`${API_URL}/api/license/by-token`, {
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

  async function handleCancel(): Promise<void> {
    if (!figmaUserId || !token) return;
    setCancelStatus("submitting");
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/subscription/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ figmaUserId, token }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error || `Cancel failed (${res.status})`);
      }
      const body = (await res.json()) as { ok: boolean; accessUntil: string };
      setCancelStatus("success");
      setLicense((prev) =>
        prev
          ? {
              ...prev,
              status: "canceled",
              cycleEndsAt: body.accessUntil,
              subscription: prev.subscription
                ? { ...prev.subscription, canceledAt: new Date().toISOString() }
                : null,
            }
          : prev,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cancel failed");
      setCancelStatus("idle");
    }
  }

  const failureCount = license?.subscription?.failureCount ?? 0;
  const failureSeverity = getFailureSeverity(failureCount);
  const failureSeverityClass = {
    info: styles.failedPaymentBannerInfo,
    warning: styles.failedPaymentBannerWarning,
    urgent: styles.failedPaymentBannerUrgent,
  }[failureSeverity];

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

          <h1>Manage subscription</h1>

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
                  <span>
                    {license.status === "canceled"
                      ? "Access until"
                      : license.subscription.autoRenew
                        ? "Next billing"
                        : "Pro expires"}
                  </span>
                  <span className={styles.value}>
                    {formatDate(license.subscription.nextBillingAt)}
                  </span>
                </div>
              )}
            </div>
          )}

          {license?.plan === "pro" &&
            license.status === "active" &&
            license.subscription?.autoRenew === true &&
            cancelStatus === "idle" && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCancelStatus("confirming")}
              >
                Cancel subscription
              </button>
            )}

          {license?.plan === "pro" &&
            license.status === "active" &&
            license.subscription?.autoRenew === false && (
              <p className={styles.subtle}>
                You purchased Pro as a one-time payment — no auto-renewal,
                nothing to cancel. Your Pro access ends on{" "}
                {license.subscription
                  ? formatDate(license.subscription.nextBillingAt)
                  : "the date above"}
                . Buy another 30 days anytime from the plugin.
              </p>
            )}

          {cancelStatus === "confirming" && (
            <div className={styles.confirm}>
              <p>
                Cancellation takes effect at the end of your current billing
                cycle. You'll keep Pro access until then. No refunds — you
                can re-subscribe anytime.
              </p>
              <div className={styles.actions}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setCancelStatus("idle")}
                >
                  Keep my subscription
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleCancel}
                >
                  Cancel anyway
                </button>
              </div>
            </div>
          )}

          {cancelStatus === "submitting" && <p>Canceling…</p>}

          {cancelStatus === "success" && (
            <p className={styles.success}>
              Subscription canceled. You'll retain Pro access until your cycle
              ends.
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
