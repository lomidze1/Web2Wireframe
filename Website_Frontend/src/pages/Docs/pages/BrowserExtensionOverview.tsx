import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const BrowserExtensionOverview = (): ReactElement => (
  <DocsLayout>
    <h2>Extension Overview</h2>

    <h3>What the extension does</h3>
    <p>
      The Browser Extension allows you to capture website content directly from
      your browser and send it to Web2Wireframe in Figma. Instead of copying
      URLs or screenshots manually, you can select content on a live page and
      start the wireframe generation instantly.
    </p>
    <p>
      The extension is designed to work seamlessly with Web2Wireframe, making
      it easier to move from browsing the web to structured wireframes without
      breaking your workflow.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Browser extension UI open on a webpage"
      />
      <figcaption className={styles.imageCaption}>
        Browser extension UI open on a webpage.
      </figcaption>
    </figure>
    <p>
      Helpful link:{" "}
      <a href="/docs/start/fast-first-import">Fast First Import</a>
    </p>

    <h3>When to use the extension</h3>
    <p>
      The extension is most useful when you want to work quickly while browsing
      live websites. It removes friction between discovering content and
      turning it into a wireframe.
    </p>
    <p>Use the extension when:</p>
    <ul>
      <li>You want to capture content directly from a live page</li>
      <li>You need to select a specific section without importing the full page</li>
      <li>You are researching competitors or inspiration</li>
      <li>You want to avoid downloading screenshots or copying URLs manually</li>
    </ul>
    <p>
      If you already have a URL or image, other import methods like{" "}
      <a href="/docs/import-methods/web-import">Web Import</a> or{" "}
      <a href="/docs/import-methods/screenshot-import">Screenshot Import</a> may
      also work well.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Browser page with extension icon highlighted"
      />
      <figcaption className={styles.imageCaption}>
        Browser page with extension icon highlighted.
      </figcaption>
    </figure>

    <h3>How it works with Web2Wireframe</h3>
    <p>
      The Browser Extension acts as a bridge between the web and Figma. Once
      activated, it captures selected content and sends it to Web2Wireframe,
      where the wireframe generation takes place.
    </p>
    <p>The flow typically looks like this:</p>
    <ol>
      <li>Open the extension on a webpage</li>
      <li>Select or capture the desired content</li>
      <li>Send the data to Web2Wireframe</li>
      <li>Generate the wireframe inside Figma</li>
    </ol>
    <p>
      This integration keeps the generation logic inside Web2Wireframe while
      allowing the extension to focus on fast and precise capture.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Flow diagram from browser to extension to Web2Wireframe to Figma"
      />
      <figcaption className={styles.imageCaption}>
        Browser to extension to Web2Wireframe to Figma.
      </figcaption>
    </figure>

    <h3>Notes and recommendations</h3>
    <p>
      The extension works best on pages with clear structure and visible layout
      boundaries. Highly dynamic pages or heavy animations may require
      additional refinement after import.
    </p>
    <p>For best results:</p>
    <ul>
      <li>Capture one section at a time</li>
      <li>Avoid selecting overlapping elements</li>
      <li>Combine extension imports with wireframe libraries for consistency</li>
    </ul>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Clean capture versus cluttered capture comparison"
      />
      <figcaption className={styles.imageCaption}>
        Clean capture vs cluttered capture comparison.
      </figcaption>
    </figure>

    <h3>Video overview</h3>
    <p>
      A short overview video can help users understand the value of the
      extension quickly.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Browser extension overview video placeholder"
      />
      <figcaption className={styles.imageCaption}>
        Browser extension overview (20-30s).
      </figcaption>
    </figure>

    <h3>Next step</h3>
    <p>
      Continue to{" "}
      <a href="/docs/browser-extension/import-with-extension">
        Import with Extension
      </a>{" "}
      to see how to start an import directly from the browser and view the
      result in Figma.
    </p>
  </DocsLayout>
);

export default BrowserExtensionOverview;
