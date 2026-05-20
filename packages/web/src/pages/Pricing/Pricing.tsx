import type { ReactElement } from "react";
import { checkoutLinks } from "../../data/links";
import {
  formatUsdCents,
  formatUsdCentsShort,
  isLikelyEuVisitor,
} from "../../utils/currency";
import styles from "./Pricing.module.scss";

type Plan = {
  name: string;
  price: string;
  period: string;
  summary: string;
  features: string[];
  cta: string;
  link: string;
  highlight?: boolean;
};

const PRO_CENTS = 1600;
const PRO_PRICE_SHORT = formatUsdCentsShort(PRO_CENTS);
const PRO_PRICE = formatUsdCents(PRO_CENTS);

const plans: Plan[] = [
  {
    name: "Free",
    price: formatUsdCentsShort(0),
    period: "/forever",
    summary: "Best for quick exploration and basic wireframe imports.",
    features: [
      "10 imports per month",
      "Colors: plugin only",
      "Fonts: plugin only",
      "Viewports: 1920, 1440 only",
      "Text content: placeholders only",
      "Styles & assets: not included",
      "Support: Community",
    ],
    cta: "Install Plugin — Start Free",
    link: checkoutLinks.free,
  },
  {
    name: "Pro",
    price: PRO_PRICE_SHORT,
    period: "/ 30 days",
    summary:
      "Unlimited imports with full styling, real text content, and assets.",
    features: [
      "Unlimited imports",
      "Full color & font access",
      "All viewports (1920 / 1440 / 1024 / 768 / 375)",
      "Real text content",
      "Styles & assets included",
      "Hover state capture",
      "Font binary download (ZIP + auto-install)",
      "Priority email support (24h response)",
      `One-time ${PRO_PRICE_SHORT} — you're charged once, no auto-renewal`,
    ],
    cta: "Get Pro from Plugin",
    link: checkoutLinks.pro,
    highlight: true,
  },
];

const Pricing = (): ReactElement => {
  // Render once on first paint — `isLikelyEuVisitor()` is cheap and
  // depends only on the browser's resolved time zone.
  const showEuVatNote = isLikelyEuVisitor();
  return (
  <div className={styles.page}>
    <section className={styles.hero}>
      <div className="container">
        <div className={styles.heroCard}>
          <div className={`${styles.sectionLabel} section-label`}>Pricing</div>
          <h1>
            Simple pricing. Upgrade when you need full fidelity.
          </h1>
          <p>
            Start free with 10 imports per month. Upgrade to Pro for{" "}
            {PRO_PRICE_SHORT} → 30 days of unlimited imports, full styling,
            and assets. No subscription, no auto-renewal.
          </p>
        </div>
      </div>
    </section>

    <section className={styles.section}>
      <div className="container">
        <div className={styles.grid}>
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`${styles.card} ${
                plan.highlight ? styles.highlight : ""
              }`}
            >
              <div className={styles.cardHead}>
                <div className="badge">{plan.name}</div>
                <h2>
                  {plan.price} <span>{plan.period}</span>
                </h2>
                <p>{plan.summary}</p>
              </div>
              <ul className={styles.list}>
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <a
                className={`btn ${
                  plan.highlight ? "btn-primary" : "btn-secondary"
                }`}
                href={plan.link}
                target="_blank"
                rel="noreferrer"
              >
                {plan.cta}
              </a>
              {plan.highlight && (
                <>
                  <p className={styles.trustNote}>
                    Secure checkout by Flitt (PCI-DSS Level 1) · Apple Pay,
                    Google Pay & all major cards · See{" "}
                    <a href="/terms">Terms</a> for refund policy
                  </p>
                  {showEuVatNote && (
                    <p className={styles.trustNote}>
                      EU note: charged in USD ({PRO_PRICE}). Your bank will
                      convert and may apply FX margin; local VAT (if any)
                      is your responsibility.
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
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
