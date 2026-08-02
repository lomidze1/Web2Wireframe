import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { getOrderView } from "../Account/accountLogic";
import { derivePrice } from "../../components/ImportConsole/consoleLogic";
import { formatUsdCents, isLikelyEuVisitor } from "../../utils/currency";
import styles from "./CheckoutPage.module.scss";

type ProTier = "monthly" | "yearly";

const PRO_MONTHLY_CENTS = 1600;
const PRO_YEARLY_CENTS = 14400;

const flowPoints = [
  "Payment happens on Flitt's secure page — Apple Pay, Google Pay and all major cards.",
  "We never see your card. One-time payment, no auto-renewal.",
  "The plugin picks up Pro on its own — no key to paste.",
];

interface CheckoutErrorResponse {
  error?: string;
  remainingDays?: number;
  renewalOpensInDays?: number;
}

const CheckoutPage = (): ReactElement | null => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tier: ProTier =
    searchParams.get("billing") === "monthly" ? "monthly" : "yearly";
  const billing = tier === "yearly" ? "annual" : "monthly";

  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auth gate: checkout needs a session for figmaUserId — bounce through
  // /signin and come back.
  useEffect(() => {
    if (!loading && !user) {
      navigate("/signin", {
        replace: true,
        state: { next: `/checkout?billing=${tier}` },
      });
    }
  }, [loading, user, navigate, tier]);

  if (loading || !user) return null;

  const order = getOrderView(billing);
  const price = derivePrice(billing);
  const showEuVatNote = isLikelyEuVisitor();
  const chargedCents = tier === "yearly" ? PRO_YEARLY_CENTS : PRO_MONTHLY_CENTS;

  const setTier = (next: ProTier): void => {
    setSearchParams({ billing: next }, { replace: true });
    setError(null);
  };

  const handlePay = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const returnUrl = `${window.location.origin}/checkout/success?plan=${tier}`;
      const res = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          figmaUserId: user.figmaUserId,
          plan: tier,
          returnUrl,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        checkoutUrl?: string;
      } & CheckoutErrorResponse;
      if (!res.ok || !data.checkoutUrl) {
        if (data.error === "already_pro") {
          const opens = data.renewalOpensInDays;
          const left = data.remainingDays;
          setError(
            opens != null && left != null
              ? `You're already on Pro — renewal opens ${opens} ${opens === 1 ? "day" : "days"} before it ends (${left} ${left === 1 ? "day" : "days"} left).`
              : "You're already on Pro — renewal opens shortly before your plan ends.",
          );
        } else {
          setError("Checkout failed. Please try again.");
        }
        setBusy(false);
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setError("Checkout failed. Please try again.");
      setBusy(false);
    }
  };

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.head}>
        <div className={styles.kicker}>Checkout</div>
        <h1 className={styles.title}>Web2Wireframe Pro</h1>
        <p className={styles.lead}>
          Unlimited imports. One payment — the plan simply runs to the end of
          the period.
        </p>
      </div>

      <div className={styles.grid}>
        <div className={styles.left}>
          <div>
            <div className={styles.groupLabel}>Billing period</div>
            <div className={styles.periodGrid}>
              <button
                type="button"
                aria-pressed={tier === "monthly"}
                className={`${styles.periodCard} ${
                  tier === "monthly" ? styles.periodCardActive : ""
                }`}
                onClick={() => setTier("monthly")}
              >
                <span className={styles.periodTitle}>Monthly</span>
                <span className={styles.periodSub}>
                  {price.monthly} each month
                </span>
              </button>
              <button
                type="button"
                aria-pressed={tier === "yearly"}
                className={`${styles.periodCard} ${
                  tier === "yearly" ? styles.periodCardActive : ""
                }`}
                onClick={() => setTier("yearly")}
              >
                <span className={styles.periodTitle}>
                  Yearly · save {price.savePct}
                </span>
                <span className={styles.periodSub}>
                  {price.annual} once a year
                </span>
              </button>
            </div>
          </div>

          <div className={styles.rule} />

          <div className={styles.points}>
            {flowPoints.map((point) => (
              <div key={point} className={styles.point}>
                {point}
              </div>
            ))}
          </div>
        </div>

        <div className={styles.orderCard}>
          <div className={styles.orderKicker}>Order</div>
          <div className={styles.orderRow}>
            <span className={styles.orderLine}>{order.line}</span>
            <span className={styles.orderAmount}>{order.amount}</span>
          </div>
          <div className={styles.orderRow}>
            <span className={styles.orderMuted}>VAT</span>
            <span className={styles.orderMuted}>Calculated at payment</span>
          </div>
          <div className={styles.rule} />
          <div className={styles.orderRow}>
            <span className={styles.dueLabel}>Due today</span>
            <span className={styles.dueAmount}>{order.amount}</span>
          </div>
          <p className={styles.orderNote}>{order.note}</p>
          {error && <p className={styles.error}>{error}</p>}
          <button
            type="button"
            className="btn btn-primary btn-block"
            disabled={busy}
            onClick={handlePay}
          >
            {busy ? "Opening secure payment…" : order.payLabel}
          </button>
          <Link className="btn btn-ghost btn-block" to="/account">
            Back to account
          </Link>
          <p className={styles.finePrint}>
            Payments handled by Flitt (PCI-DSS Level 1). We never see your
            card.
          </p>
          {showEuVatNote && (
            <p className={styles.finePrint}>
              EU note: charged in USD ({formatUsdCents(chargedCents)}). Your
              bank will convert and may apply FX margin; local VAT (if any) is
              your responsibility.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
