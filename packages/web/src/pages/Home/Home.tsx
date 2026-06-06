import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { installLinks } from "../../data/links";
import { useAuth } from "../../contexts/AuthContext";
import styles from "./Home.module.scss";

type ComparisonRow = {
  feature: string;
  free: string;
  pro: string;
};

type Step = {
  title: string;
  desc: string;
};

type FeatureGroup = {
  title: string;
  subtitle: string;
  items: string[];
};

const featureGroups: FeatureGroup[] = [
  {
    title: "Capture",
    subtitle: "Import websites in the way that fits your workflow.",
    items: [
      "Web URL import",
      "Screenshot import",
      "HTML/CSS import",
      "Area selection",
    ],
  },
  {
    title: "Analyze",
    subtitle: "Automatically detect layout and structure.",
    items: ["Layout detection", "Block-level structure", "Hover state capture"],
  },
  {
    title: "Output",
    subtitle: "Clean, editable Figma-ready results.",
    items: [
      "Clean & editable wireframes",
      "Multi-viewport export",
      "Styles & assets included (Pro)",
    ],
  },
];

const steps: Step[] = [
  {
    title: "Choose a website (URL)",
    desc: "Pick any public URL you want to convert.",
  },
  {
    title: "Open the W2W plugin in Figma",
    desc: "Launch the plugin directly from your Figma workspace.",
  },
  {
    title: "Paste the URL",
    desc: "Drop the URL into the plugin and we handle the rest.",
  },
  {
    title: "Adjust the import settings",
    desc: "Choose your preferred output type and fidelity level.",
  },
  {
    title: "Click Import and get an editable wireframe in Figma",
    desc: "Receive clean, ready-to-edit layers instantly.",
  },
];

const comparisonRows: ComparisonRow[] = [
  { feature: "Imports per month", free: "10", pro: "Unlimited" },
  { feature: "Colors", free: "Full access", pro: "Full access" },
  { feature: "Fonts", free: "Full access", pro: "Full access" },
  { feature: "Viewports", free: "Full access", pro: "Full access" },
  { feature: "Text Content", free: "Full access", pro: "Full access" },
  { feature: "Styles & Assets", free: "Included", pro: "Included" },
  { feature: "Hover state capture", free: "Yes", pro: "Yes" },
  { feature: "Font binary download", free: "Yes", pro: "Yes" },
  { feature: "Support", free: "Community", pro: "Priority" },
];

const lovePoints: string[] = [
  "Fastest way to get stakeholder sites into Figma for teardown.",
  "Keeps layers tidy: frames, text, buttons, and spacing you can actually edit.",
  "Wireframe, blocks, or full UI kit — pick the fidelity you need per project.",
  "Great for audits, redesigns, component mining, and inspiration capture.",
];

const Home = (): ReactElement => {
  const { openPricing } = useAuth();
  return (
    <div className={styles.home}>
      <section className={styles.hero}>
        <div className="container">
          <div className={styles.heroHead}>
            {/* S-H2: H1 now includes "Figma plugin" — the primary search query.
              Previously H1 ranked well for "convert website to Figma wireframes"
              but missed the higher-volume "Figma plugin" query. */}
            <h1 className={styles.heroTitle}>
              The Figma Plugin That Converts Any Website Into Editable
              Wireframes — Instantly.
            </h1>
            <p>Stop rebuilding layouts from scratch.</p>
          </div>

          <div className={styles.heroVisual}>
            <div className={styles.flow}>
              <div className={styles.browserMock}>
                <div className={styles.browserDots}>
                  <span />
                  <span />
                  <span />
                </div>
                <div className={styles.browserBody}>
                  <div className={styles.browserNav} />
                  <div className={styles.browserCard} />
                  <div className={styles.browserGrid}>
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
              <div className={styles.arrow}>→</div>
              <img
                src="/logo.svg"
                alt="Web2Wireframe logo"
                className={styles.logoMark}
              />
              <div className={styles.arrow}>→</div>
              <div className={styles.wireframeMock}>
                <div className={styles.figmaTag}>Figma</div>
                <div className={styles.wireframeHeader} />
                <div className={styles.wireframeBlocks}>
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            </div>
            <h2 className={styles.visualNote}>
              Built specifically for Figma workflows
            </h2>
          </div>

          <div className={styles.heroTextBlock}>
            <div className={styles.actions}>
              <ul className={styles.diffList}>
                <li>
                  <span
                    className={`${styles.diffIcon} ${styles.iconCalendar}`}
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 24 24" role="presentation">
                      <rect x="4" y="6.5" width="16" height="13" rx="2" />
                      <path d="M4 10.5h16" />
                      <path d="M9 4v4" />
                      <path d="M15 4v4" />
                      <path d="M9 14h2" />
                      <path d="M13 14h2" />
                    </svg>
                  </span>
                  <div>
                    <strong>Layout-first parsing</strong>
                    <p>Understands structure, not just pixels.</p>
                  </div>
                </li>
                <li>
                  <span
                    className={`${styles.diffIcon} ${styles.iconCheck}`}
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 24 24" role="presentation">
                      <path d="M6 12.5l4 3.5 8-9" />
                    </svg>
                  </span>
                  <div>
                    <strong>Designer-ready output</strong>
                    <p>Clean, editable Figma components.</p>
                  </div>
                </li>
                <li>
                  <span
                    className={`${styles.diffIcon} ${styles.iconClock}`}
                    aria-hidden="true"
                  >
                    <svg viewBox="0 0 24 24" role="presentation">
                      <circle cx="12" cy="12" r="7.5" />
                      <path d="M12 8v5l3 2" />
                    </svg>
                  </span>
                  <div>
                    <strong>Minutes, not hours</strong>
                    <p>From website to wireframe fast.</p>
                  </div>
                </li>
              </ul>
              {/* S-H2: until the Figma Community plugin URL exists, the
                primary CTA is a disabled "Available soon" placeholder.
                Using a button (not anchor) so `aria-disabled` + cursor
                styling work without an `href`. Once the plugin ships,
                restore the anchor pointing to the real community URL. */}
              <button
                type="button"
                className="btn btn-primary"
                aria-disabled="true"
                disabled
                title="Plugin launches soon"
              >
                Available soon • Figma Community
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.how}>
        <div className="container">
          <div className={styles.sectionHead}>
            <div className={`${styles.compareBadge} section-label`}>
              Getting Started
            </div>
            <h2>5 Simple Steps to Convert Websites to Wireframes</h2>
            <p>From URL to editable Figma frames in a minute.</p>
          </div>
          <div className={styles.steps}>
            {steps.map((step, index) => (
              <div key={step.title} className={styles.stepCard}>
                <div className={styles.stepIndex}>
                  {(index + 1).toString().padStart(2, "0")}
                </div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.features}>
        <div className="container">
          <div className={styles.sectionHead}>
            <div className={`${styles.compareBadge} section-label`}>
              Design Process
            </div>
            <h2>Everything you need to turn websites into wireframes.</h2>
            <p>
              Powerful import options, smart structure detection, and clean
              Figma output ready for editing and handoff.
            </p>
          </div>
          <div className={styles.featureGrid}>
            {featureGroups.map((group) => (
              <div key={group.title} className={styles.featureGroup}>
                <div className={styles.featureGroupHead}>
                  <h3>{group.title}</h3>
                  <p>{group.subtitle}</p>
                </div>
                <ul className={styles.featureList}>
                  {group.items.map((item) => (
                    <li key={item}>
                      <span className={styles.dot} aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.comparison}>
        <div className="container">
          <div className={styles.compareTop}>
            <div className={`${styles.compareBadge} section-label`}>
              Compare Plans
            </div>

            <div>
              <h2>Choose your plan. Upgrade when you need more control.</h2>
              <p>
                Pick the access level that fits your workflow. Switch plans
                anytime as your wireframing needs grow.
              </p>
            </div>
          </div>
          <div className={styles.table}>
            <div className={`${styles.tableHead} ${styles.tableRow}`}>
              <span>Feature</span>
              <span>Free</span>
              <span>Pro</span>
            </div>
            {comparisonRows.map((row) => (
              <div key={row.feature} className={styles.tableRow}>
                <span>{row.feature}</span>
                <span>{row.free}</span>
                <span>{row.pro}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.love}>
        <div className="container">
          <div className={styles.sectionHead}>
            <div className={`${styles.compareBadge} section-label`}>
              Why designers love it
            </div>
            <h2>
              Optimized for audits, inspiration capture, and clean handoff.
            </h2>
          </div>
          <div className={styles.loveGrid}>
            {lovePoints.map((point) => (
              <div key={point} className={styles.loveCard}>
                <span className={styles.spark}>✺</span>
                <p>{point}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="container">
          <div className={styles.ctaCard}>
            <div>
              <h2>
                Install the free plugin. Upgrade to Pro when you need more.
              </h2>
              <p>
                Start with wireframes, unlock images/styles/assets with Pro.
              </p>
            </div>
            <div className={styles.actions}>
              <div className={styles.actionsSecondary}>
                <a
                  className="btn btn-secondary"
                  href={installLinks.figmaCommunity}
                  target="_blank"
                  rel="noreferrer"
                >
                  Start Free
                </a>

                <Link
                  className="btn btn-secondary"
                  to="/docs/browser-extension/extension-overview"
                >
                  Browser Extension
                </Link>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => openPricing()}
              >
                Upgrade to Pro
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Home;
