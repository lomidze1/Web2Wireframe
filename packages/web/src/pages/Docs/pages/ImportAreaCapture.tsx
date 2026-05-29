import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const ImportAreaCapture = (): ReactElement => (
  <DocsLayout>
    <h1>Area Capture</h1>

    <h2>What is Area Capture</h2>
    <p>
      Area Capture allows you to generate a wireframe from a specific part of a
      webpage, rather than importing the entire page. This method is designed
      for focused work on individual sections such as heroes, feature blocks,
      pricing sections, or dashboards.
    </p>
    <p>
      Instead of processing a full layout, Web2Wireframe analyzes only the
      selected area and converts it into a clean, editable wireframe in Figma.
      This gives you precision and control when you do not need the whole page.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Area Capture mode with highlighted selectable area"
      />
      <figcaption className={styles.imageCaption}>
        Area Capture mode with highlighted selectable area.
      </figcaption>
    </figure>
    <p>
      Helpful link:{" "}
      <a href="/docs/start/fast-first-import">Fast First Import</a>
    </p>

    <h2>Selecting an area</h2>
    <p>
      To use Area Capture, you first define the part of the page you want to
      convert. This can be done visually by selecting or marking the desired
      region before starting the generation.
    </p>
    <p>When selecting an area:</p>
    <ul>
      <li>Focus on a single logical section</li>
      <li>Avoid overlapping multiple unrelated blocks</li>
      <li>Make sure the selected area contains clear layout boundaries</li>
    </ul>
    <p>
      The more focused the selection, the cleaner and more accurate the
      generated wireframe will be.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Selecting an area on a webpage with highlighted rectangle"
      />
      <figcaption className={styles.imageCaption}>
        Selecting an area on a webpage.
      </figcaption>
    </figure>

    <h2>What gets generated</h2>
    <p>
      After generation, Web2Wireframe creates a wireframe that represents only
      the selected area. The output is structured and fully editable, just like
      other import methods.
    </p>
    <p>You can expect:</p>
    <ul>
      <li>Clear section structure within the selected area</li>
      <li>Grouped and organized elements in Figma layers</li>
      <li>Editable blocks that can be rearranged or reused</li>
    </ul>
    <p>
      This makes Area Capture especially useful for building modular layouts or
      reusable components without importing unnecessary content.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Generated wireframe of a single section in Figma"
      />
      <figcaption className={styles.imageCaption}>
        Generated wireframe of a single section in Figma.
      </figcaption>
    </figure>

    <h2>When Area Capture works best</h2>
    <p>
      Area Capture is most effective when you want to focus on specific parts
      of a page rather than the full layout.
    </p>
    <p>It works best for:</p>
    <ul>
      <li>Importing hero sections or landing page blocks</li>
      <li>Reusing design patterns from existing websites</li>
      <li>Extracting components for wireframe libraries</li>
      <li>Iterating on a single section during redesigns</li>
      <li>Working with long or complex pages where full import is unnecessary</li>
    </ul>
    <p>If you need a complete page structure instead, consider using:</p>
    <ul>
      <li>
        <a href="/docs/import-methods/web-import">Web Import</a>
      </li>
      <li>
        <a href="/docs/import-methods/screenshot-import">Screenshot Import</a>
      </li>
    </ul>

    <h2>Best practices</h2>
    <p>To get the best results with Area Capture:</p>
    <ul>
      <li>Select one section at a time</li>
      <li>Avoid areas with heavy animations or overlays</li>
      <li>Use Area Capture early to build reusable blocks</li>
      <li>Combine it with wireframe libraries for consistency</li>
    </ul>
    <p>Area Capture is most powerful when used as part of a modular workflow.</p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Modular wireframe blocks reused across pages"
      />
      <figcaption className={styles.imageCaption}>
        Modular wireframe blocks reused across pages.
      </figcaption>
    </figure>

    <h2>Video walkthrough</h2>
    <p>A short video can clearly demonstrate how Area Capture works.</p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Area Capture video walkthrough placeholder"
      />
      <figcaption className={styles.imageCaption}>
        Area Capture walkthrough (20-30s).
      </figcaption>
    </figure>

    <h2>Next step</h2>
    <p>
      You've now explored all available import methods. Continue to{" "}
      <a href="/docs/browser-extension/extension-overview">Browser Extension</a>{" "}
      to learn how to capture content directly from your browser.
    </p>
  </DocsLayout>
);

export default ImportAreaCapture;
