import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const ImportScreenshot = (): ReactElement => (
  <DocsLayout>
    <h1>Screenshot Import</h1>

    <h2>What is Screenshot import</h2>
    <p>
      Screenshot Import allows you to generate a wireframe from a static image
      of a website or interface. Instead of using a live URL, Web2Wireframe
      analyzes a screenshot and converts its visual structure into an editable
      wireframe in Figma.
    </p>
    <p>
      This method is useful when a website cannot be accessed directly,
      requires login, or exists only as an image. Screenshot Import focuses on
      layout and visual hierarchy, helping you quickly recreate structure
      without rebuilding it manually.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Screenshot Import UI with image upload or drag and drop state"
      />
      <figcaption className={styles.imageCaption}>
        Screenshot Import UI state.
      </figcaption>
    </figure>
    <p>
      Helpful link:{" "}
      <a href="/docs/start/fast-first-import">Fast First Import</a>
    </p>

    <h2>Supported screenshots</h2>
    <p>
      Web2Wireframe supports most common screenshot formats and sources. You
      can import screenshots taken from different devices and environments, as
      long as the layout is clearly visible.
    </p>
    <p>Supported sources include:</p>
    <ul>
      <li>Desktop website screenshots</li>
      <li>Mobile website screenshots</li>
      <li>Full-page captures</li>
      <li>Cropped interface screenshots</li>
    </ul>
    <p>
      For best results, screenshots should clearly show page sections, spacing,
      and content blocks. Blurry or heavily compressed images may reduce
      accuracy.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Examples of supported screenshots: desktop and mobile"
      />
      <figcaption className={styles.imageCaption}>
        Examples of supported screenshots.
      </figcaption>
    </figure>

    <h2>Best practices</h2>
    <p>To get the most accurate wireframes from Screenshot Import:</p>
    <ul>
      <li>Use high-resolution screenshots whenever possible</li>
      <li>Avoid screenshots with overlays, pop-ups, or modal dialogs</li>
      <li>Capture the page in a clean state</li>
      <li>Crop out browser UI when possible to focus on the layout</li>
      <li>Import one screen at a time for clearer structure</li>
    </ul>
    <p>
      If the screenshot contains multiple sections stacked vertically,
      Web2Wireframe will attempt to detect logical grouping automatically. You
      can refine the result afterward in Figma.
    </p>
    <p>
      For advanced control over layout behavior, review{" "}
      <a href="/docs/start/set-settings">Set Settings</a>.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Good vs bad screenshot comparison"
      />
      <figcaption className={styles.imageCaption}>
        Good vs bad screenshot comparison.
      </figcaption>
    </figure>

    <h2>Typical scenarios</h2>
    <p>
      Screenshot Import is especially useful in situations where live web
      access is not available or practical.
    </p>
    <p>Common scenarios include:</p>
    <ul>
      <li>Working with password-protected or internal tools</li>
      <li>Importing designs from presentations or PDFs</li>
      <li>Recreating layouts from shared images or mockups</li>
      <li>Analyzing competitor interfaces without direct access</li>
      <li>Capturing mobile screens from devices or emulators</li>
    </ul>
    <p>This method gives you flexibility when a URL-based import is not possible.</p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Screenshot to wireframe example on Figma canvas"
      />
      <figcaption className={styles.imageCaption}>
        Screenshot to wireframe example in Figma.
      </figcaption>
    </figure>

    <h2>Notes and limitations</h2>
    <p>
      Because Screenshot Import works from a static image, it relies entirely
      on visual cues. Some limitations may occur when:
    </p>
    <ul>
      <li>Text is very small or low contrast</li>
      <li>Sections overlap or are visually ambiguous</li>
      <li>The screenshot includes heavy visual effects</li>
    </ul>
    <p>In these cases, you may want to:</p>
    <ul>
      <li>
        Try <a href="/docs/import-methods/web-import">Web Import</a> if a URL is
        available
      </li>
      <li>
        Use <a href="/docs/import-methods/area-capture">Area Capture</a> for
        more control
      </li>
      <li>Manually refine the generated structure in Figma</li>
    </ul>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Ambiguous layout example"
      />
      <figcaption className={styles.imageCaption}>
        Ambiguous layout example.
      </figcaption>
    </figure>

    <h2>Video walkthrough</h2>
    <p>A short video can help users understand the flow quickly.</p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Screenshot Import video walkthrough placeholder"
      />
      <figcaption className={styles.imageCaption}>
        Screenshot Import walkthrough (20-30s).
      </figcaption>
    </figure>

    <h2>Next step</h2>
    <p>
      Continue to{" "}
      <a href="/docs/import-methods/html-import">HTML Import</a> to learn how to
      generate wireframes directly from HTML content.
    </p>
  </DocsLayout>
);

export default ImportScreenshot;
