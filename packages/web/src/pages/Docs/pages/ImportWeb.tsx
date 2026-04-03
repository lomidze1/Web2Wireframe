import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const ImportWeb = (): ReactElement => (
  <DocsLayout>
    <h2>Web Import</h2>

    <h3>What is Web import</h3>
    <p>
      Web Import lets you generate a wireframe from a live website by providing
      its URL. Web2Wireframe analyzes the page structure and hierarchy, then
      converts it into an editable wireframe directly in Figma.
    </p>
    <p>
      This method is ideal when you want to work from real, up-to-date layouts
      without manually recreating sections and components. Web Import focuses
      on structure and layout, giving you a clean base you can refine, redesign,
      and iterate on.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Web Import UI state with URL input and Generate button"
      />
      <figcaption className={styles.imageCaption}>
        Web Import UI state with URL input and Generate button.
      </figcaption>
    </figure>
    <p>
      Helpful link:{" "}
      <a href="/docs/start/fast-first-import">Fast First Import</a>
    </p>

    <h3>When to use it</h3>
    <p>
      Use Web Import when your source is a real website that you can access via
      a URL and you want a fast structural starting point.
    </p>
    <p>Web Import works best for:</p>
    <ul>
      <li>Redesigns and UX improvements based on an existing site</li>
      <li>Competitor or inspiration analysis</li>
      <li>Quickly mapping layout structure for multiple pages</li>
      <li>Preparing wireframes for product discussions and team alignment</li>
    </ul>
    <p>
      If your goal is to capture only a specific part of a page (not the full
      page), consider{" "}
      <a href="/docs/import-methods/area-capture">Area Capture</a> instead.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Before and after comparison of website screenshot and generated wireframe"
      />
      <figcaption className={styles.imageCaption}>
        Website screenshot vs generated wireframe.
      </figcaption>
    </figure>

    <h3>What gets imported</h3>
    <p>
      Web Import generates a wireframe representation of the page layout and
      content blocks. The output is designed to be structured and editable
      rather than pixel-perfect.
    </p>
    <p>Typically, you can expect:</p>
    <ul>
      <li>Page sections and hierarchy (header, content blocks, footer)</li>
      <li>Layout structure and spacing (organized blocks)</li>
      <li>Editable elements grouped logically in Figma layers</li>
    </ul>
    <p>After import, you can:</p>
    <ul>
      <li>Rearrange sections</li>
      <li>Adjust spacing</li>
      <li>Replace text and placeholders</li>
      <li>Apply your design system styles</li>
    </ul>
    <p>
      For more control over output structure, see{" "}
      <a href="/docs/start/set-settings">Set Settings</a>.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Figma Layers panel showing organized groups and sections"
      />
      <figcaption className={styles.imageCaption}>
        Organized sections in Figma layers.
      </figcaption>
    </figure>

    <h3>Common use cases</h3>
    <p>
      Redesign planning: Generate a structural wireframe to quickly understand
      what exists today, then iterate into a new layout.
    </p>
    <p>
      UX audit and improvement: Use the generated structure to identify layout
      issues, content hierarchy problems, and missing sections.
    </p>
    <p>
      Competitor breakdown: Import competitor pages to analyze patterns and
      build better page architecture for your own product.
    </p>
    <p>
      Team collaboration: Start from a shared structural baseline in Figma so
      product, design, and development teams align faster.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Example board with multiple imported pages arranged side-by-side"
      />
      <figcaption className={styles.imageCaption}>
        Multiple imported pages arranged side-by-side.
      </figcaption>
    </figure>

    <h3>Best practices</h3>
    <p>To get cleaner results from Web Import:</p>
    <ul>
      <li>Start with a page that is publicly accessible (no login required)</li>
      <li>Use the most stable URL version (avoid pages that change content)</li>
      <li>
        Import one page first, then refine settings before importing multiple
        pages
      </li>
      <li>
        If the page is very long, import key pages first and expand later
      </li>
    </ul>
    <p>
      If you run into issues, check{" "}
      <a href="/docs/troubleshooting">Troubleshooting</a> for common solutions.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Web Import video placeholder"
      />
      <figcaption className={styles.imageCaption}>
        Web Import in action (20-30s walkthrough).
      </figcaption>
    </figure>

    <h3>Notes and limitations</h3>
    <p>
      Web Import depends on the structure that can be read from the website.
      Some pages may generate less clean results when:
    </p>
    <ul>
      <li>Content is highly dynamic or loaded after the initial render</li>
      <li>Critical sections require login or are blocked</li>
      <li>Layouts are heavily script-driven and change per user/session</li>
    </ul>
    <p>If Web Import is not giving the structure you expect, try:</p>
    <ul>
      <li>
        <a href="/docs/import-methods/screenshot-import">Screenshot Import</a>
      </li>
      <li>
        <a href="/docs/import-methods/html-import">HTML Import</a>
      </li>
      <li>
        <a href="/docs/import-methods/area-capture">Area Capture</a>
      </li>
    </ul>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Dynamic content example"
      />
      <figcaption className={styles.imageCaption}>
        Dynamic content example.
      </figcaption>
    </figure>

    <h3>Next step</h3>
    <p>
      Continue to{" "}
      <a href="/docs/import-methods/screenshot-import">Screenshot Import</a> to
      learn how to generate wireframes from static images.
    </p>
  </DocsLayout>
);

export default ImportWeb;
