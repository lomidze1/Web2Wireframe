import type { ReactElement } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { checkoutLinks } from "../../data/links";
import { derivePrice } from "../../components/ImportConsole/consoleLogic";
import { formatUsdCents, isLikelyEuVisitor } from "../../utils/currency";
import styles from "./Pricing.module.scss";

type ProTier = "monthly" | "yearly";

const FREE_FEATURES = [
  "10 imports per month",
  "URL, screenshot, HTML/CSS and area select",
  "All viewports, colours, fonts and text modes",
  "Real assets, Figma variables, hover states",
  "Community support",
];

const PRO_FEATURES = [
  "Unlimited imports",
  "Multi-viewport runs in a single import",
  "Font binary download for exact type",
  "Priority support, direct to the maker",
  "One-time payment — no auto-renewal",
];

const COMPARE_ROWS = [
  { feature: "Imports per month", free: "10", pro: "Unlimited" },
  { feature: "URL, screenshot, HTML/CSS, area select", free: "All four", pro: "All four" },
  { feature: "Viewports", free: "Full access", pro: "Full access" },
  { feature: "Layout mode, text and asset modes", free: "Full access", pro: "Full access" },
  { feature: "Colours and fonts", free: "Full access", pro: "Full access" },
  { feature: "Figma variables", free: "Included", pro: "Included" },
  { feature: "Hover state capture", free: "Included", pro: "Included" },
  { feature: "Font binary download", free: "—", pro: "Included" },
  { feature: "Support", free: "Community", pro: "Priority" },
];

const FAQ = [
  {
    q: "Is anything in the settings paywalled?",
    a: "Only the font binary download. Every viewport, layout mode, text mode, asset mode, palette and variable option works on the free plan from the first import.",
  },
  {
    q: "What counts as an import?",
    a: "One run of the plugin, however many viewports it produces. A three-viewport run is one import, not three.",
  },
  {
    q: "Do I need to cancel anything?",
    a: "No. Pro is a one-time payment — 30 or 365 days, no auto-renewal. When it runs out you're back on Free; renew, or switch between monthly and yearly, whenever you like.",
  },
  {
    q: "Does it work on pages behind a login?",
    a: "Not by URL — nothing can fetch those. Use screenshot import or area select from the browser extension, which see the page as you do.",
  },
];

const PRO_MONTHLY_CENTS = 1600;
const PRO_YEARLY_CENTS = 14400;

const Pricing = (): ReactElement => {
  // Default to Yearly so first-time visitors land on the better deal —
  // mirrors the plugin's Plan modal which highlights the Yearly card.
  const [tier, setTier] = useState<ProTier>("yearly");
  const price = derivePrice(tier === "yearly" ? "annual" : "monthly");
  // Render once on first paint — `isLikelyEuVisitor()` is cheap and
  // depends only on the browser's resolved time zone.
  const showEuVatNote = isLikelyEuVisitor();
  const chargedCents = tier === "yearly" ? PRO_YEARLY_CENTS : PRO_MONTHLY_CENTS;

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <div className={styles.kicker}>Pricing</div>
          <h1 className={styles.title}>One line in the plan: how many imports.</h1>
          <p className={styles.lead}>
            Free and Pro run the same engine with the same settings. We don't
            lock the useful options behind the paywall — you'd only find out
            after you'd stopped caring.
          </p>
        </div>
        <div
          className={styles.billingToggle}
          role="tablist"
          aria-label="Billing period"
        >
          <button
            type="button"
            role="tab"
            aria-selected={tier === "monthly"}
            className={`${styles.billingBtn} ${
              tier === "monthly" ? styles.billingBtnActive : ""
            }`}
            onClick={() => setTier("monthly")}
          >
            Monthly
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tier === "yearly"}
            className={`${styles.billingBtn} ${
              tier === "yearly" ? styles.billingBtnActive : ""
            }`}
            onClick={() => setTier("yearly")}
          >
            Yearly · save {price.savePct}
          </button>
        </div>
      </div>

      <div className={styles.plans}>
        <div className={styles.planCard}>
          <div className={styles.planKicker}>Free</div>
          <div className={styles.planPrice}>$0</div>
          <p className={styles.planNote}>
            Ten imports a month, every option unlocked. Enough to run a full
            audit of a small site and know whether this belongs in your week.
          </p>
          <div className={styles.rule} />
          <ul className={styles.featureList}>
            {FREE_FEATURES.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          <a
            className={`btn btn-secondary btn-block ${styles.planCta}`}
            href={checkoutLinks.free}
            target="_blank"
            rel="noreferrer"
          >
            Install free
          </a>
        </div>

        <div className={`${styles.planCard} ${styles.planCardPro}`}>
          <div className={styles.proHead}>
            <div className={styles.planKickerPro}>Pro</div>
            <span className="tag tag-accent">{price.badge}</span>
          </div>
          <div className={styles.proPriceRow}>
            <span className={styles.planPrice}>{price.big}</span>
            <span className={styles.priceUnit}>{price.unit}</span>
          </div>
          <p className={styles.planNote}>{price.note}</p>
          <div className={styles.rule} />
          <ul className={`${styles.featureList} ${styles.featureListPro}`}>
            {PRO_FEATURES.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          <Link
            className={`btn btn-primary btn-block ${styles.planCta}`}
            to={`/checkout?billing=${tier}`}
          >
            Get Pro
          </Link>
          <p className={styles.trustNote}>
            By purchasing, you agree to our <a href="/terms">Terms</a> and{" "}
            <a href="/privacy">Privacy Policy</a>. Secure checkout by Flitt
            (PCI-DSS Level 1) · Apple Pay, Google Pay &amp; all major cards.
          </p>
          {showEuVatNote && (
            <p className={styles.trustNote}>
              EU note: charged in USD ({formatUsdCents(chargedCents)}). Your
              bank will convert and may apply FX margin; local VAT (if any) is
              your responsibility.
            </p>
          )}
        </div>
      </div>

      <div className={styles.compare}>
        <h2 className={styles.sectionTitle}>Side by side</h2>
        <table className="table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Free</th>
              <th>Pro</th>
            </tr>
          </thead>
          <tbody>
            {COMPARE_ROWS.map((row) => (
              <tr key={row.feature}>
                <td>{row.feature}</td>
                <td>{row.free}</td>
                <td>{row.pro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.faq}>
        <h2 className={styles.sectionTitle}>Questions worth asking first</h2>
        <div className={styles.faqGrid}>
          {FAQ.map((item) => (
            <div key={item.q} className={styles.faqItem}>
              <h3 className={styles.faqQ}>{item.q}</h3>
              <p className={styles.faqA}>{item.a}</p>
            </div>
          ))}
        </div>
        <p className={styles.billingContact}>
          Questions about billing or purchases?{" "}
          <a href="mailto:billing@web2wireframe.design">
            billing@web2wireframe.design
          </a>
        </p>
      </div>
    </div>
  );
};

export default Pricing;
