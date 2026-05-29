import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const BrowserExtensionImport = (): ReactElement => (
  <DocsLayout>
    <h1>Import with Extension</h1>

    <h2>Starting an import from the extension</h2>
    <p>
      To start an import using the Browser Extension, open any website in your
      browser and activate the Web2Wireframe extension. Once opened, the
      extension allows you to begin capturing content directly from the page
      you are viewing.
    </p>
    <p>
      From this point, you can decide whether you want to capture a full
      section or focus on a specific area. The extension is designed to keep
      this step fast, so you can move from browsing to importing without
      interrupting your workflow.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Browser toolbar with Web2Wireframe extension opened"
      />
      <figcaption className={styles.imageCaption}>
        Browser toolbar with Web2Wireframe extension opened.
      </figcaption>
    </figure>
    <p>
      Helpful link:{" "}
      <a href="/docs/browser-extension/extension-overview">Extension Overview</a>
    </p>

    <h2>Capturing content</h2>
    <p>
      After starting the import, select the content you want to capture. The
      extension highlights selectable areas on the page, helping you focus on
      meaningful layout sections.
    </p>
    <p>For best results:</p>
    <ul>
      <li>Select one clear section at a time</li>
      <li>Avoid overlapping unrelated elements</li>
      <li>Focus on visible layout boundaries</li>
    </ul>
    <p>
      The goal of this step is to define what should be converted into a
      wireframe, not to capture visual styling details.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Webpage with highlighted selectable area"
      />
      <figcaption className={styles.imageCaption}>
        Webpage with highlighted selectable area.
      </figcaption>
    </figure>

    <h2>Sending data to Figma</h2>
    <p>
      Once the content is selected, send it directly to Web2Wireframe in Figma.
      The extension transfers the captured data and triggers the wireframe
      generation process inside the plugin.
    </p>
    <p>
      No manual file handling is required. The data flows from the browser to
      Figma automatically, keeping the generation process centralized within
      Web2Wireframe. If Figma is not already open, you may be prompted to
      switch to it to complete the generation.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Extension send to Figma confirmation state"
      />
      <figcaption className={styles.imageCaption}>
        Extension send to Figma confirmation state.
      </figcaption>
    </figure>

    <h2>Result in Figma</h2>
    <p>
      After the data is received, Web2Wireframe generates a wireframe directly
      on your Figma canvas. The result is a structured, editable layout
      representing the captured content.
    </p>
    <p>You can immediately:</p>
    <ul>
      <li>Rearrange sections</li>
      <li>Adjust spacing and structure</li>
      <li>Combine the result with existing wireframes</li>
      <li>Reuse the generated blocks in other projects</li>
    </ul>
    <p>
      The wireframe produced via the extension follows the same principles as
      other import methods - clean structure, full editability, and flexibility
      for iteration.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Generated wireframe in Figma after extension import"
      />
      <figcaption className={styles.imageCaption}>
        Generated wireframe in Figma after extension import.
      </figcaption>
    </figure>

    <h2>Video walkthrough</h2>
    <p>A short walkthrough video can clearly demonstrate the full flow.</p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Extension import video walkthrough placeholder"
      />
      <figcaption className={styles.imageCaption}>
        Extension import walkthrough (30s).
      </figcaption>
    </figure>

    <h2>Next step</h2>
    <p>
      You've now completed the full import workflow using the Browser
      Extension. Return to{" "}
      <a href="/docs/start/getting-started">Getting Started</a> or explore{" "}
      <a href="/docs/import-methods">Import Methods</a> to try other ways of
      generating wireframes.
    </p>
  </DocsLayout>
);

export default BrowserExtensionImport;
