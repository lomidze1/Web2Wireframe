import type { ReactElement } from "react";
import { useState } from "react";
import { checkoutLinks } from "../../data/links";
import { useAuth } from "../../contexts/AuthContext";
import {
  formatUsdCents,
  formatUsdCentsShort,
  isLikelyEuVisitor,
} from "../../utils/currency";
import styles from "./Pricing.module.scss";

type ProTier = "monthly" | "yearly";

const PRO_MONTHLY_CENTS = 1600;
const PRO_YEARLY_CENTS = 14400;
const PRO_MONTHLY_SHORT = formatUsdCentsShort(PRO_MONTHLY_CENTS);
const PRO_YEARLY_SHORT = formatUsdCentsShort(PRO_YEARLY_CENTS);

const PRO_TIER_COPY: Record<
  ProTier,
  {
    priceShort: string;
    priceFull: string;
    period: string;
    days: number;
    extraFeatures: string[];
  }
> = {
  monthly: {
    priceShort: PRO_MONTHLY_SHORT,
    priceFull: formatUsdCents(PRO_MONTHLY_CENTS),
    period: "/ 30 days",
    days: 30,
    extraFeatures: ["One-time payment — no auto-renewal"],
  },
  yearly: {
    priceShort: PRO_YEARLY_SHORT,
    priceFull: formatUsdCents(PRO_YEARLY_CENTS),
    period: "/ 365 days",
    days: 365,
    // Note: the "25% cheaper" savings is communicated by the floating "Save
    // 25%" tag over the Yearly toggle — don't repeat it here.
    extraFeatures: [
      "Lock in pricing for the whole year",
      "One-time payment — no auto-renewal",
    ],
  },
};

const PRO_BASE_FEATURES = [
  "Unlimited imports",
  "Full color & font access",
  "All viewports (1920 / 1440 / 1024 / 768 / 375)",
  "Real text content",
  "Styles & assets included",
  "Hover state capture",
  "Font binary download (ZIP + auto-install)",
  "Priority email support (24h response)",
];

const FREE_FEATURES = [
  "10 imports per month",
  "Full features — same fidelity as Pro",
  "All colors, fonts & viewports",
  "Real text content, styles & assets",
  "Hover state capture & font downloads",
  "Counter resets every 30 days",
  "Community support",
];

const Pricing = (): ReactElement => {
  // Default to Yearly so first-time visitors land on the better deal —
  // mirrors the plugin's Plan modal which highlights the Yearly card.
  const [tier, setTier] = useState<ProTier>("yearly");
  const { openPricing } = useAuth();
  const proCopy = PRO_TIER_COPY[tier];
  const proFeatures = [...PRO_BASE_FEATURES, ...proCopy.extraFeatures];
  // Render once on first paint — `isLikelyEuVisitor()` is cheap and
  // depends only on the browser's resolved time zone.
  const showEuVatNote = isLikelyEuVisitor();

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroCard}>
            <div className={`${styles.sectionLabel} section-label`}>
              Pricing
            </div>
            <h1>Simple pricing. Upgrade when you need full fidelity.</h1>
            <p>
              Start free with 10 imports per month. Upgrade to Pro —{" "}
              {PRO_MONTHLY_SHORT} for 30 days, or {PRO_YEARLY_SHORT} for a
              full year and save 25%. No subscription, no auto-renewal.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className="container">
          <div className={styles.grid}>
            {/* Free card */}
            <div className={styles.card}>
              <div className={styles.cardHead}>
                <div className="badge">Free</div>
                <h2>
                  {formatUsdCentsShort(0)} <span>/forever</span>
                </h2>
                <p>
                  Full-featured — try everything, capped at 10 imports per
                  month.
                </p>
              </div>
              <ul className={styles.list}>
                {FREE_FEATURES.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <a
                className="btn btn-secondary"
                href={checkoutLinks.free}
                target="_blank"
                rel="noreferrer"
              >
                Install Plugin — Start Free
              </a>
            </div>

            {/* Pro card with Monthly/Yearly toggle. The "Pro" badge is
                intentionally omitted — the price ≠ $0 and the toggle's
                Monthly/Yearly options already identify this as the paid
                tier, so the badge would just be visual noise above the
                price headline (which is the real hero of the card). */}
            <div className={`${styles.card} ${styles.highlight}`}>
              <div className={styles.cardHead}>
                <h2>
                  {proCopy.priceShort} <span>{proCopy.period}</span>
                </h2>
                <p>
                  Unlimited imports with full styling, real text content, and
                  assets.
                </p>

                {/* Tier toggle — full-width tab bar. The floating "Save 25%"
                    callout sits above the Yearly tab so the discount reads
                    as a permanent attention-grabber, not a nested control. */}
                <div
                  className={styles.tierToggle}
                  role="tablist"
                  aria-label="Pro plan duration"
                >
                  <span className={styles.saveFloatingTag} aria-hidden="true">
                    Save 25%
                  </span>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tier === "monthly"}
                    className={`${styles.tierBtn} ${
                      tier === "monthly" ? styles.tierBtnActive : ""
                    }`}
                    onClick={() => setTier("monthly")}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={tier === "yearly"}
                    className={`${styles.tierBtn} ${
                      tier === "yearly" ? styles.tierBtnActive : ""
                    }`}
                    onClick={() => setTier("yearly")}
                  >
                    Yearly
                  </button>
                </div>
              </div>
              <ul className={styles.list}>
                {proFeatures.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => openPricing(tier)}
              >
                Get Pro
              </button>
              <p className={styles.trustNote}>
                By purchasing, you agree to our <a href="/terms">Terms</a> and{" "}
                <a href="/privacy">Privacy Policy</a>.
              </p>
              <p className={styles.trustNote}>
                Secure checkout by Flitt (PCI-DSS Level 1) · Apple Pay, Google
                Pay & all major cards · See <a href="/terms">Terms</a> for
                refund policy
              </p>
              {showEuVatNote && (
                <p className={styles.trustNote}>
                  EU note: charged in USD ({proCopy.priceFull}). Your bank
                  will convert and may apply FX margin; local VAT (if any) is
                  your responsibility.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className={styles.contactBanner}>
        <h2>
          Questions about billing or purchases? Email us at{" "}
          <a
            className={styles.contactEmail}
            href="mailto:billing@web2wireframe.design"
            aria-label="Email billing@web2wireframe.design"
          >
            billing@web2wireframe.design
          </a>
        </h2>
      </div>
    </div>
  );
};

export default Pricing;
