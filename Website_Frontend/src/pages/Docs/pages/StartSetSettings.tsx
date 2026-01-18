import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const StartSetSettings = (): ReactElement => (
  <DocsLayout>
    <h2>Set Settings</h2>

    <h3>Settings overview</h3>
    <p>
      Settings in Web2Wireframe allow you to control how wireframes are
      generated. They influence layout behavior, structure, and level of
      detail before generation begins.
    </p>
    <p>
      You don't need to change settings every time. Default settings are
      optimized to work well for most use cases, especially for fast
      exploration and first-time use.
    </p>
    <p>
      Settings become more important as your workflow grows and you need
      consistency across multiple wireframes.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Settings panel overview"
      />
      <figcaption className={styles.imageCaption}>
        Settings panel overview.
      </figcaption>
    </figure>

    <h3>Core layout settings</h3>
    <p>
      Core layout settings define how wireframes are visually structured on the
      canvas. These settings affect spacing, grouping, and overall layout
      rhythm.
    </p>
    <p>Using layout settings, you can:</p>
    <ul>
      <li>Control how compact or spaced the layout feels</li>
      <li>Improve readability of generated structures</li>
      <li>Match the wireframe density to your project needs</li>
    </ul>
    <p>
      These settings help you generate wireframes that are easier to work with
      from the start.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Layout spacing and grouping settings"
      />
      <figcaption className={styles.imageCaption}>
        Layout spacing and grouping settings.
      </figcaption>
    </figure>

    <h3>Content structure options</h3>
    <p>
      Content structure options control how Web2Wireframe groups and organizes
      elements. They determine how sections, blocks, and components are
      arranged in the final wireframe.
    </p>
    <p>Adjusting these options is useful when you want:</p>
    <ul>
      <li>High-level structure for early planning</li>
      <li>More detailed breakdowns for UX work</li>
      <li>Cleaner grouping for reuse in the Library</li>
    </ul>
    <p>
      Structure options help align generated wireframes with your current
      design phase.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Content structure options and grouping"
      />
      <figcaption className={styles.imageCaption}>
        Content structure options and grouping.
      </figcaption>
    </figure>
    <p>
      Related: <a href="/docs/library/overview">Library Overview</a>
    </p>

    <h3>When to change settings</h3>
    <p>
      In many cases, you can rely on default settings. You should consider
      changing settings when:
    </p>
    <ul>
      <li>You are generating multiple wireframes for the same project</li>
      <li>You want consistent structure across pages</li>
      <li>You are preparing wireframes for team collaboration</li>
      <li>You need more or less detail than usual</li>
    </ul>
    <p>
      Settings are flexible and can be adjusted at any time before
      regenerating wireframes.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Settings adjusted for consistent structure"
      />
      <figcaption className={styles.imageCaption}>
        Settings adjusted for consistent structure.
      </figcaption>
    </figure>
    <p>
      Related:{" "}
      <a href="/docs/start/fast-first-import">Fast First Import</a>
    </p>
  </DocsLayout>
);

export default StartSetSettings;
