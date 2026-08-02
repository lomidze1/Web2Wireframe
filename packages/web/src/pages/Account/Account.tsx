import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { getQuotaView } from "./accountLogic";
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

// The one merged shape both data sources (plugin-signed token and the
// website session) reduce to.
interface AccountView {
  figmaUserId: string;
  email: string | null;
  plan: "free" | "pro";
  status: string;
  endsAt: string | null;
  imports: number;
  limit: number | null;
  failureCount: number;
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
  const hasTokenLink = Boolean(figmaUserId && token);

  const { user, loading: authLoading, login, logout } = useAuth();

  const [license, setLicense] = useState<AccountLicense | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(hasTokenLink);

  useEffect(() => {
    if (!hasTokenLink) return;
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
  }, [hasTokenLink, figmaUserId, token]);

  const handleSignOut = async (): Promise<void> => {
    if (window.confirm("Sign out of Web2Wireframe?")) {
      await logout();
    }
  };

  // Merge the two data sources into one view.
  const view: AccountView | null = license
    ? {
        figmaUserId: license.figmaUserId,
        email: license.email,
        plan: license.plan,
        status: license.status,
        endsAt: license.cycleEndsAt ?? null,
        imports: license.usage.imports,
        limit: license.limits.imports,
        failureCount: license.subscription?.failureCount ?? 0,
      }
    : !hasTokenLink && user
      ? {
          figmaUserId: user.figmaUserId,
          email: user.email,
          plan: user.plan,
          status: user.status,
          endsAt: user.cycleEndsAt,
          imports: user.usage.imports,
          limit: user.usage.limit,
          failureCount: 0,
        }
      : null;

  if (isLoading || (!hasTokenLink && authLoading)) {
    return (
      <div className={`container ${styles.page}`}>
        <p className={styles.stateLine}>Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`container ${styles.page}`}>
        <div className={styles.kicker}>Account</div>
        <h1 className={styles.stateTitle}>That link didn't verify.</h1>
        <p className={styles.stateLine}>
          {error} — open the page again from the plugin, or{" "}
          <a href="mailto:billing@web2wireframe.design">
            email billing@web2wireframe.design
          </a>
          .
        </p>
      </div>
    );
  }

  // Signed out and no plugin-signed link — invite either path.
  if (!view) {
    return (
      <div className={`container ${styles.page}`}>
        <div className={styles.emptyState}>
          <div className={styles.kicker}>Account</div>
          <h1 className={styles.stateTitle}>Sign in to see your plan.</h1>
          <p className={styles.stateLine}>
            Same account as the plugin — your quota and plan, always current.
          </p>
          <div className={styles.emptyActions}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => login("/account")}
            >
              Sign in with Figma
            </button>
            <Link className="btn btn-secondary" to="/pricing">
              See pricing
            </Link>
          </div>
          <p className={styles.subtleNote}>
            You can also open this page from the plugin in Figma — your plan
            info lives in the Plan modal.
          </p>
        </div>
      </div>
    );
  }

  const quota = getQuotaView(view.plan, view.imports, view.limit);
  const isPro = view.plan === "pro";
  const failureSeverity = getFailureSeverity(view.failureCount);

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.head}>
        <div>
          <div className={styles.kicker}>Account</div>
          <h1 className={styles.title}>{view.email ?? view.figmaUserId}</h1>
          <p className={styles.headMeta}>User ID {view.figmaUserId}</p>
        </div>
        {!hasTokenLink && (
          <button
            type="button"
            className={styles.signOut}
            onClick={handleSignOut}
          >
            Sign out
          </button>
        )}
      </div>

      <div className={styles.body}>
        <div className={styles.planCard}>
          <div className={styles.planHead}>
            <div className={styles.planNameRow}>
              <span className={styles.planName}>{isPro ? "Pro" : "Free"}</span>
              <span className="tag tag-outline">
                {isPro ? "unlimited imports" : "every option unlocked"}
              </span>
            </div>
            <span className={styles.planResets}>
              {isPro
                ? view.endsAt
                  ? `Pro until ${formatDate(view.endsAt)}`
                  : "No limit"
                : view.endsAt
                  ? `Resets ${formatDate(view.endsAt)}`
                  : "Resets monthly"}
            </span>
          </div>

          {view.failureCount > 0 && (
            <p
              data-severity={failureSeverity}
              className={styles.failureLine}
            >
              Last payment attempt failed ({view.failureCount}{" "}
              {view.failureCount === 1 ? "attempt" : "attempts"}).
              {view.endsAt &&
                ` Update your payment method by ${formatDate(view.endsAt)} to keep Pro access.`}
            </p>
          )}

          <div className={styles.quotaRow}>
            <span className={styles.quotaNumeral}>{quota.numeral}</span>
            <span className={styles.quotaCaption}>{quota.caption}</span>
          </div>
          <div className={styles.meter}>
            <div className={styles.meterFill} style={{ width: quota.pct }} />
          </div>
          <p className={styles.quotaLine}>{quota.line}</p>

          <div className={styles.rule} />
          <p className={styles.billingNote}>
            Questions about billing?{" "}
            <a href="mailto:billing@web2wireframe.design">
              billing@web2wireframe.design
            </a>
          </p>
        </div>

        <div className={styles.sideColumn}>
          <div
            className={`${styles.sideCard} ${!isPro ? styles.sideCardAccent : ""}`}
          >
            {!isPro ? (
              <>
                <div className={styles.sideKicker}>Pro</div>
                <p className={styles.sideTitle}>
                  Ten a month is a small site, not a work week.
                </p>
                <p className={styles.sideBody}>
                  Unlimited imports, multi-viewport runs and font binaries for
                  $12 a month, paid once a year.
                </p>
                <Link
                  className="btn btn-primary btn-block"
                  to="/checkout?billing=yearly"
                >
                  Upgrade to Pro
                </Link>
              </>
            ) : (
              <>
                <div className={styles.sideKicker}>Your plan</div>
                <p className={styles.sideTitle}>
                  {view.endsAt
                    ? `Pro until ${formatDate(view.endsAt)}.`
                    : "Pro."}
                </p>
                <p className={styles.sideBody}>
                  One payment, no auto-renewal. Renew from here when it gets
                  close.
                </p>
                <Link className="btn btn-secondary btn-block" to="/checkout">
                  Renew
                </Link>
              </>
            )}
          </div>

          <div className={styles.sideCard}>
            <div className={styles.sideKickerMuted}>Billing</div>
            {isPro ? (
              <div className={styles.billingRows}>
                <div className={styles.billingRow}>
                  <span>Paid until</span>
                  <span className={styles.billingValue}>
                    {view.endsAt ? formatDate(view.endsAt) : "—"}
                  </span>
                </div>
                <div className={styles.billingRow}>
                  <span>Payment</span>
                  <span className={styles.billingValue}>
                    One-time, no auto-renewal
                  </span>
                </div>
              </div>
            ) : (
              <p className={styles.sideBody}>
                No payment method on file. Nothing is charged until you choose
                Pro.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Account;
