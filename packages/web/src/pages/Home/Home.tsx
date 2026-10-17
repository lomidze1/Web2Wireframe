import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import ImportConsole from "../../components/ImportConsole/ImportConsole";
import { derivePrice } from "../../components/ImportConsole/consoleLogic";
import { installLinks } from "../../data/links";
import styles from "./Home.module.scss";

const steps = [
  { n: "01", title: "Pick a source", body: "A URL, a screenshot, pasted HTML, or a region you draw." },
  { n: "02", title: "Open W2W in Figma", body: "The plugin runs in the file you're already working in." },
  { n: "03", title: "Hand it the page", body: "Paste, drop, or select. Parsing starts immediately." },
  { n: "04", title: "Set the options", body: "The eight decisions. Thirty seconds here, an hour saved after." },
  { n: "05", title: "Import", body: "Named, editable layers land on the canvas, ready to change." },
];

const screenshotItems = [
  {
    title: "Behind a login",
    body: "Dashboards, account settings, anything a crawler is shown the door for.",
  },
  {
    title: "Checkout and paywalls",
    body: "The three screens every audit needs and no public URL will give you.",
  },
  {
    title: "A slide or a PDF",
    body: "Whatever the client sent at eleven at night, in whatever format they had.",
  },
  {
    title: "One region only",
    body: "Area select takes the pricing table, not the eight sections around it.",
  },
];

const Home = (): ReactElement => {
  const price = derivePrice("annual");

  return (
    <>
      <section className={`container ${styles.hero}`}>
        <div className={styles.heroGrid}>
          <div>
            <div className={styles.kicker}>Import configuration, not cleanup</div>
            <h1 className={styles.heroTitle}>
              Decide how the wireframe comes out — before it lands in Figma.
            </h1>
            <p className={styles.heroSub}>
              Eight decisions before the import, not an evening of fixing after it.
            </p>
            <div className={styles.heroActions}>
              <a
                className="btn btn-primary"
                href={installLinks.figmaCommunity}
                target="_blank"
                rel="noreferrer"
              >
                Install on Figma Community
              </a>
              <a
                className="btn btn-secondary"
                href={installLinks.chrome}
                target="_blank"
                rel="noreferrer"
              >
                Browser extension
              </a>
            </div>
          </div>
          <div className={styles.heroAside}>
            <p className={styles.heroAsideLine}>
              Below is the plugin's real settings panel. Change anything — the
              frame redraws as Figma would receive it.
            </p>
          </div>
        </div>
      </section>

      <section className={`container ${styles.consoleSection}`}>
        <ImportConsole />
      </section>

      <section className={`container ${styles.comparison}`}>
        <div className={styles.comparisonGrid}>
          <div className={styles.comparisonLeft}>
            <div className={styles.kickerMuted}>The usual way</div>
            <h2 className={styles.comparisonTitle}>Import once, then fix everything.</h2>
            <p className={styles.comparisonBodyMuted}>
              One button, one output. You get absolute positions where you wanted
              auto layout, real marketing copy where you wanted placeholders, hex
              values where your library expects variables. The import took thirty
              seconds; the tidying takes the rest of the afternoon, and you do it
              again on the next page.
            </p>
          </div>
          <div className={styles.comparisonRight}>
            <div className={styles.kicker}>Web2Wireframe</div>
            <h2 className={styles.comparisonTitle}>Configure once, import clean.</h2>
            <p className={styles.comparisonBody}>
              Say what you want before the frame exists. Auto layout or absolute.
              Semantic placeholders, Lorem at the original character counts, or
              the site's own words. Grey boxes or the real images. Direct values
              or generated Figma variables. Three viewports in one run. What
              arrives is already the file you would have edited it into.
            </p>
          </div>
        </div>
      </section>

      <section className={`container ${styles.screenshot}`}>
        <div className={styles.screenshotGrid}>
          <div>
            <div className={styles.kicker}>Screenshot import</div>
            <h2 className={styles.screenshotTitle}>For the pages a URL can't reach.</h2>
            <p className={styles.screenshotLead}>
              Half of the work worth studying sits behind something. Drop an
              image in and it is parsed into structured frames the same way a
              live page is.
            </p>
          </div>
          <div className={styles.screenshotItems}>
            {screenshotItems.map((item) => (
              <div key={item.title} className={styles.screenshotItem}>
                <h3 className={styles.itemTitle}>{item.title}</h3>
                <p className={styles.itemBody}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`container ${styles.steps}`}>
        <h2 className={styles.stepsTitle}>Five steps, about a minute.</h2>
        <p className={styles.stepsSub}>
          Step four is the one worth your attention.{" "}
          <Link className={styles.inlineLink} to="/how-it-works">
            See what each option does
          </Link>
          .
        </p>
        <div className={styles.stepsGrid}>
          {steps.map((step) => (
            <div key={step.n} className={styles.step}>
              <div className={styles.stepNumeral}>{step.n}</div>
              <h3 className={styles.stepTitle}>{step.title}</h3>
              <p className={styles.stepBody}>{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={`container ${styles.planClose}`}>
        <div className={styles.planPanel}>
          <div>
            <h2 className={styles.planTitle}>
              Ten imports free. Every option unlocked from the first one.
            </h2>
            <p className={styles.planBody}>
              Nothing in the settings panel is held back on the free plan —
              viewports, variables, real assets, all of it. Pro removes the
              monthly count, for the weeks when one audit is twenty pages.
            </p>
            <div className={styles.planActions}>
              <a
                className="btn btn-primary"
                href={installLinks.figmaCommunity}
                target="_blank"
                rel="noreferrer"
              >
                Install free
              </a>
              <Link className="btn btn-secondary" to="/pricing">
                Compare plans
              </Link>
            </div>
          </div>
          <div className={styles.planRows}>
            <div className={styles.planRow}>
              <span className={styles.planName}>Free</span>
              <span className={styles.planValue}>3 imports / month</span>
            </div>
            <div className={styles.planRow}>
              <span className={styles.planName}>Pro</span>
              <span className={styles.planValue}>
                Unlimited · {price.monthly} / month
              </span>
            </div>
            <div className={`${styles.planRow} ${styles.planRowLast}`}>
              <span className={styles.planValue}>Pro, yearly</span>
              <span className={styles.planValueAccent}>
                {price.annual} · {price.perMonth} / month
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
};

export default Home;
