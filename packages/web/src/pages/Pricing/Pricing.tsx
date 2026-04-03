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
      "Colors: plugin only",
      "Fonts: plugin only",
      "Viewports: 1920, 1440 only",
      "Text content: placeholders only",
      "Styles & assets: not included",
      "AI generation: not available",
      "Library access: not included",
      "Support: Community",
    ],
    cta: "Start Free",
    link: "https://www.figma.com/community",
  },
  {
    name: "Plus",
    price: "$12",
    period: "/month",
    summary:
      "Unlimited imports with full styling, text content, and clean components.",
    features: [
      "Full color & font access",
      "All viewports included",
      "Real text content",
      "Styles & assets included",
      "Clean, structured components",
      "No AI generation",
      "No library access",
      "Support: Standard",
    ],
    cta: "Get Plus",
    link: checkoutLinks.proMonthly,
  },
  {
    name: "Pro",
    price: "$20",
    period: "/month",
    summary:
      "Everything in Plus, with AI-powered generation and access to reusable wireframe and layout libraries.",
    features: [
      "Everything in Plus",
      "AI-powered generation",
      "Component & layout library access",
      "Priority support queue",
      "Best for teams, agencies, and power users",
    ],
    cta: "Get Pro",
    link: checkoutLinks.proYearly,
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
            Start free, then unlock images, assets, and multi-page captures with
            Pro.
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
