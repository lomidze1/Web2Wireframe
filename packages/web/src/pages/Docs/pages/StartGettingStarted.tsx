import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const StartGettingStarted = (): ReactElement => (
  <DocsLayout>
    <h1>Getting Started</h1>

    <h2>What happens when you open the plugin</h2>
    <p>
      When you open Web2Wireframe for the first time, the plugin launches into
      its main workspace inside Figma. This is the central area where all
      imports and library actions begin.
    </p>
    <p>
      Nothing is generated automatically at this stage. Web2Wireframe waits
      for your input so you can decide how you want to start — by choosing an
      import method (URL, screenshot, HTML, area capture, or browser
      extension).
    </p>
    <p>
      This approach ensures you stay in full control from the very beginning.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Web2Wireframe main workspace inside Figma"
      />
      <figcaption className={styles.imageCaption}>
        Web2Wireframe main workspace inside Figma.
      </figcaption>
    </figure>

    <h2>Main interface overview</h2>
    <p>
      The main interface is designed to be simple, focused, and task-oriented.
      It highlights the most important actions without overwhelming you with
      advanced options.
    </p>
    <p>From the main screen, you can:</p>
    <ul>
      <li>Choose an import method</li>
      <li>Open your Library</li>
      <li>Adjust basic settings before starting</li>
    </ul>
    <p>
      The layout is intentionally minimal to help you move from opening the
      plugin to generating wireframes with as few steps as possible.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Main screen with Import and Library entry points"
      />
      <figcaption className={styles.imageCaption}>
        Main screen entry points for Import and Library.
      </figcaption>
    </figure>
    <p>
      Related:{" "}
      <a href="/docs/start/fast-first-import">Fast First Import</a>
    </p>

    <h2>Basic workflow</h2>
    <p>
      The basic workflow in Web2Wireframe follows a clear and repeatable
      pattern:
    </p>
    <ol>
      <li>Open the plugin inside your Figma file</li>
      <li>Choose an import method</li>
      <li>Adjust settings if needed</li>
      <li>Generate the wireframe</li>
      <li>Edit and reuse the result</li>
    </ol>
    <p>
      This workflow is designed for iteration. You can repeat it multiple
      times, re-import wireframes, or switch methods as your ideas evolve.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Basic workflow steps overview"
      />
      <figcaption className={styles.imageCaption}>
        Basic workflow steps overview.
      </figcaption>
    </figure>
    <p>
      Related: <a href="/docs/start/set-settings">Set Settings</a>
    </p>
  </DocsLayout>
);

export default StartGettingStarted;
