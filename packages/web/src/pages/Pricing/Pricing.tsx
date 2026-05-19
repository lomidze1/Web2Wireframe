import type { ReactElement } from "react";
import { checkoutLinks } from "../../data/links";
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

const plans: Plan[] = [
  {
    name: "Free",
    price: "$0",
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
    cta: "Start Free",
    link: "https://www.figma.com/community",
  },
  {
    name: "Pro",
    price: "$16",
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
      "One-time payment — renew manually, no auto-charge",
    ],
    cta: "Install Plugin",
    link: checkoutLinks.pro,
    highlight: true,
  },
];

const Pricing = (): ReactElement => (
  <div className={styles.page}>
    <section className={styles.hero}>
      <div className="container">
        <div className={styles.heroCard}>
          <div className={`${styles.sectionLabel} section-label`}>Pricing</div>
          <h1>
            Conversion-focused plans. Upgrade when you need more fidelity.
          </h1>
          <p>
            Start free, then unlock unlimited imports, full styling, and
            assets with Pro.
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

export default Pricing;
