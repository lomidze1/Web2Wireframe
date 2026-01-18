import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const ImportHTML = (): ReactElement => (
  <DocsLayout>
    <h2>HTML Import</h2>

    <h3>What is HTML import</h3>
    <p>
      HTML Import allows you to generate wireframes directly from raw HTML
      content instead of a live website or screenshot. This method is designed
      for cases where you already have access to markup and want to convert
      structure into a wireframe without relying on a rendered page.
    </p>
    <p>
      By importing HTML, Web2Wireframe focuses purely on document structure,
      layout hierarchy, and content organization. This makes it especially
      useful for technical workflows where clean structure matters more than
      visual appearance.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="HTML Import UI with HTML input or paste area"
      />
      <figcaption className={styles.imageCaption}>
        HTML Import UI state.
      </figcaption>
    </figure>
    <p>
      Helpful link:{" "}
      <a href="/docs/start/fast-first-import">Fast First Import</a>
    </p>

    <h3>Supported HTML content</h3>
    <p>
      Web2Wireframe supports a wide range of HTML content as long as the
      structure is clear and well-formed.
    </p>
    <p>Supported content typically includes:</p>
    <ul>
      <li>Static HTML files</li>
      <li>HTML copied from existing projects</li>
      <li>Simplified markup without heavy runtime dependencies</li>
      <li>Semantic HTML with clear sectioning</li>
    </ul>
    <p>
      For best results, the HTML should represent the main layout structure
      rather than fully styled presentation. Clean, semantic markup produces
      more predictable wireframes.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Clean HTML example and generated wireframe"
      />
      <figcaption className={styles.imageCaption}>
        Clean HTML to generated wireframe.
      </figcaption>
    </figure>

    <h3>How structure is detected</h3>
    <p>
      When using HTML Import, Web2Wireframe analyzes the document structure
      instead of rendered visuals. It looks for semantic elements, container
      hierarchy, and content grouping to build the wireframe layout.
    </p>
    <p>The plugin detects:</p>
    <ul>
      <li>Page sections and containers</li>
      <li>Hierarchical nesting of elements</li>
      <li>Content blocks and logical groupings</li>
    </ul>
    <p>
      AI-assisted processing helps organize these elements into readable,
      editable wireframe sections inside Figma. The goal is to preserve layout
      intent while keeping the result flexible and easy to modify.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="HTML structure to layout blocks diagram"
      />
      <figcaption className={styles.imageCaption}>
        HTML structure to layout blocks.
      </figcaption>
    </figure>

    <h3>Limitations</h3>
    <p>
      HTML Import works best with clean and predictable markup. Certain
      limitations may appear when the structure is highly complex or depends
      heavily on runtime behavior.
    </p>
    <p>Limitations can include:</p>
    <ul>
      <li>HTML that relies on JavaScript for layout rendering</li>
      <li>Heavily component-based frameworks without static output</li>
      <li>Inline styles or scripts that alter structure dynamically</li>
      <li>Incomplete or malformed markup</li>
    </ul>
    <p>
      In such cases, results may require additional manual refinement in Figma.
    </p>
    <p>If HTML Import does not produce the expected structure, consider using:</p>
    <ul>
      <li>
        <a href="/docs/import-methods/web-import">Web Import</a>
      </li>
      <li>
        <a href="/docs/import-methods/screenshot-import">Screenshot Import</a>
      </li>
      <li>
        <a href="/docs/import-methods/area-capture">Area Capture</a>
      </li>
    </ul>

    <h3>Best practices</h3>
    <p>To get the best results from HTML Import:</p>
    <ul>
      <li>Use semantic tags where possible (header, section, article, footer)</li>
      <li>Remove unnecessary scripts and inline styling before import</li>
      <li>Focus on layout-defining containers rather than visual details</li>
      <li>Import one page or section at a time for clarity</li>
    </ul>
    <p>These steps help Web2Wireframe generate cleaner, more usable wireframes.</p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Good vs bad HTML structure comparison"
      />
      <figcaption className={styles.imageCaption}>
        Good vs bad HTML structure comparison.
      </figcaption>
    </figure>

    <h3>Video walkthrough</h3>
    <p>A short walkthrough can help users understand when and how to use HTML Import.</p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="HTML Import video walkthrough placeholder"
      />
      <figcaption className={styles.imageCaption}>
        HTML Import walkthrough (30s).
      </figcaption>
    </figure>

    <h3>Next step</h3>
    <p>
      Continue to{" "}
      <a href="/docs/import-methods/area-capture">Area Capture</a> to learn how
      to generate wireframes from a selected part of a page.
    </p>
  </DocsLayout>
);

export default ImportHTML;
