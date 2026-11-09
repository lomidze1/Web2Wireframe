import type { ReactElement } from "react";
import { installLinks } from "../../data/links";
import styles from "./Pricing.module.scss";

// Web2Wireframe is free since 2026-11-07 (docs/plans/WEB-free-update.md).
// The URL stays /pricing: the plugin and extension Help menus link here and
// search engines know it.

const PLUGIN_FEATURES = [
  "URL import, live pages fetched and parsed",
  "HTML/CSS import, paste markup straight from devtools",
  "Area import from the browser extension",
  "Up to three viewports in one run",
  "Website-faithful or your own wireframe style",
  "Real assets, Figma variables, hover states, auto layout",
];

const EXTENSION_FEATURES = [
  "Captures pages behind a login, as you see them",
  "Select just the part of the page you need",
  "Opens straight into the Figma plugin",
];

const FAQ = [
  {
    q: "Is it really free?",
    a: "Yes. Every import method and every setting is included. There is no paid plan and nothing to upgrade to.",
  },
  {
    q: "Do I need an account or a card?",
    a: "No card, ever. The plugin uses your Figma sign-in to know who you are, and that's it.",
  },
  {
    q: "Is anything held back?",
    a: "No. Viewports, layout modes, text and asset modes, palettes, variables and hover states all work from the first import.",
  },
  {
    q: "Does it work on pages behind a login?",
    a: "Not by URL, since nothing can fetch those. Use the browser extension: it sees the page exactly as you do.",
  },
];

const Pricing = (): ReactElement => {
  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.head}>
        <div className={styles.headText}>
          <div className={styles.kicker}>Pricing</div>
          <h1 className={styles.title}>Web2Wireframe is free.</h1>
          <p className={styles.lead}>
            The Figma plugin and the browser extension are free, with every
            option included. No plans, no card, no upgrades.
          </p>
        </div>
      </div>

      <div className={styles.plans}>
        <div className={styles.planCard}>
          <div className={styles.planKicker}>Figma plugin</div>
          <div className={styles.planPrice}>Free</div>
          <p className={styles.planNote}>
            Turn any live page or pasted HTML into editable Figma layers.
          </p>
          <div className={styles.rule} />
          <ul className={styles.featureList}>
            {PLUGIN_FEATURES.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          <a
            className={`btn btn-primary btn-block ${styles.planCta}`}
            href={installLinks.figmaCommunity}
            target="_blank"
            rel="noreferrer"
          >
            Install the plugin
          </a>
        </div>

        <div className={styles.planCard}>
          <div className={styles.planKicker}>Chrome extension</div>
          <div className={styles.planPrice}>Free</div>
          <p className={styles.planNote}>
            For pages a URL can't reach: dashboards, logged-in apps, anything
            in your own browser.
          </p>
          <div className={styles.rule} />
          <ul className={styles.featureList}>
            {EXTENSION_FEATURES.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          <a
            className={`btn btn-secondary btn-block ${styles.planCta}`}
            href={installLinks.chrome}
            target="_blank"
            rel="noreferrer"
          >
            Get the extension
          </a>
        </div>
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
      </div>
    </div>
  );
};

export default Pricing;
