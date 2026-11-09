import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { installLinks } from "../../data/links";
import styles from "./HowItWorks.module.scss";

const stepsLong = [
  {
    n: "01",
    title: "Choose what you're importing",
    body: "A public URL is the fastest route, but it is not the only one. The browser extension captures anything behind a login or a paywall, pasted HTML and CSS handles a page you already have locally, and area select — from the extension — takes a single component instead of the whole document.",
  },
  {
    n: "02",
    title: "Open the plugin where the work lives",
    body: "W2W runs inside the Figma file you already have open, so the import lands next to the frames it is meant to sit beside. Nothing is exported, uploaded, or round-tripped through another tool.",
  },
  {
    n: "03",
    title: "Hand over the page",
    body: "Paste the URL or paste the markup. The parser reads structure before pixels: it looks for sections, rows, columns, repeated blocks and the flex or grid rules holding them together, so the result is a layout rather than a flat picture.",
  },
  {
    n: "04",
    title: "Configure the import",
    body: "This is the step that matters and the step people skip. Every group in the panel maps to a task you would otherwise do by hand in Figma — renaming, re-laying-out, swapping copy, deleting images, retyping hex values. Set them once and the plugin remembers your configuration for the next import.",
  },
  {
    n: "05",
    title: "Import and keep working",
    body: "Frames arrive named and nested, text is real text, images are images or placeholders as you asked, and auto layout is already applied where the source allowed it. Rename nothing. Start designing.",
  },
];

// Option vocabulary + glossary copy stay in step with the plugin's own
// Terminology panel (packages/figma-plugin .../modalPopup/Settings.tsx).
const glossary = [
  {
    kicker: "Viewports",
    title: "1440, 768, 375 — or all three at once",
    body: "Pick every width you intend to design for and the plugin runs them in one import, side by side on the canvas. Choosing them up front is the difference between one run and three.",
    meta: "Default: 1440 only",
  },
  {
    kicker: "Layout mode",
    title: "Auto layout or absolute",
    body: "Auto layout converts the page's flex and grid structures into responsive Figma frames, falling back to absolute where the source doesn't map cleanly. Absolute pins every layer at the captured x/y — right for a faithful snapshot, wrong for anything you plan to edit.",
    meta: "Change it when you'll edit the file",
  },
  {
    kicker: "Text",
    title: "Semantic, Lorem, or the site's own words",
    body: "Semantic replaces copy with neutral labels — Heading 1, Paragraph — so structure reads first. Lorem keeps the original character counts, so spacing stays honest. Real copy is for audits and stakeholder reviews where the words are the point.",
    meta: "Default: semantic placeholders",
  },
  {
    kicker: "Assets",
    title: "Grey boxes or the real images",
    body: "Placeholders match the original dimensions and keep the file light. Real assets download and embed the source images — choose it when you're presenting a redesign against the live page.",
    meta: "Default: placeholders",
  },
  {
    kicker: "Colours",
    title: "Plugin palette or detected palette",
    body: "The plugin palette is five editable roles — text, background, secondary, surface, accent — tuned for legible wireframes. The site palette imports what was actually on the page, for work that has to look like the original.",
    meta: "Both are fully editable",
  },
  {
    kicker: "Fonts",
    title: "Plugin defaults or the site's typefaces",
    body: "Defaults import instantly with no font-linking. Site fonts keep the real type; where a face isn't available in Figma, the plugin can download the binary so the file sets correctly.",
    meta: "Font binary download included",
  },
  {
    kicker: "CSS variables",
    title: "Direct values or generated Figma variables",
    body: "Direct values write hex codes and sizes straight onto the layers. Figma variables create a reusable set instead — using the site's own variable names where they exist, or generated ones where they don't. Pick this if the import will feed a library.",
    meta: "Default: direct values",
  },
];

const HowItWorks = (): ReactElement => {
  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.head}>
        <div className={styles.kicker}>How it works</div>
        <h1 className={styles.title}>
          A minute to import. Two minutes, once, to learn the options.
        </h1>
        <p className={styles.lead}>
          Most people run the plugin on its defaults and never open the
          settings. The defaults are fine. The settings are where the hours are.
        </p>
      </div>

      <div className={styles.stepList}>
        {stepsLong.map((step) => (
          <div key={step.n} className={styles.step}>
            <div className={styles.stepNumeral}>{step.n}</div>
            <h2 className={styles.stepTitle}>{step.title}</h2>
            <p className={styles.stepBody}>{step.body}</p>
          </div>
        ))}
      </div>

      <div className={styles.glossary}>
        <h2 className={styles.glossaryTitle}>Every option, and when to change it.</h2>
        <p className={styles.glossarySub}>
          Seven groups in the settings panel. Read this once and you will never
          accept a default you didn't mean.
        </p>
        <div className={styles.glossaryGrid}>
          {glossary.map((entry) => (
            <div key={entry.kicker} className="card">
              <div className="card-kicker">{entry.kicker}</div>
              <div className="card-title">{entry.title}</div>
              <div className="card-body">{entry.body}</div>
              <div className="card-meta">{entry.meta}</div>
            </div>
          ))}
        </div>
      </div>

      <div className={styles.closing}>
        <div className={styles.closingPanel}>
          <p className={styles.closingLine}>
            Try the settings before you install — the panel on the overview page
            is the real thing.
          </p>
          <Link className="btn btn-primary" to="/">
            Open the console
          </Link>
          <a
            className="btn btn-secondary"
            href={installLinks.figmaCommunity}
            target="_blank"
            rel="noreferrer"
          >
            Install free
          </a>
        </div>
      </div>
    </div>
  );
};

export default HowItWorks;
