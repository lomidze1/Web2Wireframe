import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const StartFastFirstImport = (): ReactElement => (
  <DocsLayout>
    <h1>Fast First Import</h1>

    <h2>Quick start overview</h2>
    <p>
      Fast First Import is the quickest way to generate your first wireframe.
      It is designed for users who want to see results immediately without
      configuring advanced options.
    </p>
    <p>
      This flow helps you understand how Web2Wireframe works by focusing on
      speed and clarity rather than customization.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Fast First Import entry screen"
      />
      <figcaption className={styles.imageCaption}>
        Fast First Import entry screen.
      </figcaption>
    </figure>

    <h2>Choosing an import method</h2>
    <p>
      To start your first import, choose one of the available import methods.
      Each method is designed for a different type of source:
    </p>
    <ul>
      <li>Web Import for live websites</li>
      <li>Screenshot Import for static images</li>
      <li>HTML Import for markup-based workflows</li>
      <li>Area Capture for focused sections</li>
    </ul>
    <p>
      For your first import, choose the method that best matches your available
      source. You can explore other methods later.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Import method selection options"
      />
      <figcaption className={styles.imageCaption}>
        Import method selection options.
      </figcaption>
    </figure>
    <p>
      Related: <a href="/docs/import-methods/web-import">Web Import</a>
    </p>

    <h2>Generating your first wireframe</h2>
    <p>
      After selecting an import method, start the generation process.
      Web2Wireframe analyzes the structure of the source and creates a
      wireframe directly on your Figma canvas.
    </p>
    <p>
      The generated wireframe is fully editable. You can rearrange sections,
      adjust spacing, and refine the structure immediately.
    </p>
    <p>This first result is a starting point, not a final design.</p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Generated wireframe on Figma canvas"
      />
      <figcaption className={styles.imageCaption}>
        Generated wireframe on Figma canvas.
      </figcaption>
    </figure>
    <p>
      Related:{" "}
      <a href="/docs/import-methods/web-import">Web Import</a>
    </p>

    <h2>Next steps after import</h2>
    <p>Once your first wireframe is generated, you can:</p>
    <ul>
      <li>Edit and refine the structure</li>
      <li>Save it to your Library for reuse</li>
      <li>Experiment with different import methods</li>
    </ul>
    <p>
      From here, you are ready to explore the rest of Web2Wireframe's features
      and build your workflow.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Next steps after first import"
      />
      <figcaption className={styles.imageCaption}>
        Next steps after first import.
      </figcaption>
    </figure>
    <p>
      Related: <a href="/docs/start/getting-started">Getting Started</a>
    </p>
  </DocsLayout>
);

export default StartFastFirstImport;
