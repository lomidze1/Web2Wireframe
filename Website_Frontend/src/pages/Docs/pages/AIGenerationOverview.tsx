import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const AIGenerationOverview = (): ReactElement => (
  <DocsLayout>
    <h2>AI Generation Overview</h2>

    <h3>What is AI Generation</h3>
    <p>
      AI Generation in Web2Wireframe allows you to automatically create
      structured wireframes using AI-assisted layout and structure detection.
      Instead of importing an existing website, AI Generation creates
      wireframes from predefined patterns and logic optimized for common page
      and block types.
    </p>
    <p>
      This feature is designed to help you start from a strong structural
      foundation when no source website is available or when you want to
      explore layout ideas quickly.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="AI Generations main screen with Generate Page and Generate Block cards"
      />
      <figcaption className={styles.imageCaption}>
        AI Generations main screen with Generate Page and Generate Block cards.
      </figcaption>
    </figure>
    <p>
      Related:{" "}
      <a href="/docs/start/fast-first-import">Fast First Import</a>
    </p>

    <h3>How AI Generation works in Web2Wireframe</h3>
    <p>
      AI Generation works by combining predefined layout rules, reusable
      wireframe templates, and AI-assisted decision-making. When you select a
      page or block type, Web2Wireframe generates a wireframe based on
      best-practice structure for that type.
    </p>
    <p>The generation process takes into account:</p>
    <ul>
      <li>Selected page or block type</li>
      <li>Viewport size</li>
      <li>Density level</li>
      <li>Optional structure customization</li>
    </ul>
    <p>
      The result is a clean, editable wireframe created directly on your Figma
      canvas, ready for iteration and customization.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Select type, configure, generate flow"
      />
      <figcaption className={styles.imageCaption}>
        Select type, configure, generate.
      </figcaption>
    </figure>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="AI Generation flow video placeholder"
      />
      <figcaption className={styles.imageCaption}>
        AI Generation flow overview (20-30s).
      </figcaption>
    </figure>

    <h3>Difference between Page Generation and Block Generation</h3>
    <p>
      AI Generation supports two different generation modes: Page Generation
      and Block Generation.
    </p>
    <p>
      Page Generation creates a full-page wireframe, such as a homepage,
      pricing page, or blog layout. It includes multiple sections arranged in a
      logical flow.
    </p>
    <p>
      Block Generation focuses on individual UI sections, such as heroes,
      headers, pricing tables, or testimonials. These blocks are designed to be
      reusable across multiple pages.
    </p>
    <p>
      Use Page Generation when you need a complete layout. Use Block Generation
      when you want modular components you can mix and match.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Page wireframe versus block wireframe comparison"
      />
      <figcaption className={styles.imageCaption}>
        Page wireframe vs block wireframe.
      </figcaption>
    </figure>
    <p>
      Related:{" "}
      <a href="/docs/ai-generation/page-generation">Generate Page</a>
      <br />
      Related:{" "}
      <a href="/docs/ai-generation/block-generation">Generate Block</a>
    </p>

    <h3>When to use AI Generation</h3>
    <p>
      AI Generation is most useful when you want to move fast without relying
      on an existing website or source material.
    </p>
    <p>Common use cases include:</p>
    <ul>
      <li>Starting a new project from scratch</li>
      <li>Exploring layout ideas quickly</li>
      <li>Creating placeholder wireframes for planning</li>
      <li>Generating consistent layouts across multiple pages</li>
      <li>Building reusable wireframe blocks</li>
    </ul>
    <p>
      AI Generation works especially well in early design phases where
      structure matters more than final visual styling.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Blank canvas to AI-generated wireframe"
      />
      <figcaption className={styles.imageCaption}>
        Blank canvas to AI-generated wireframe.
      </figcaption>
    </figure>

    <h3>Limitations and expectations of AI Generation</h3>
    <p>
      AI Generation is designed to create strong structural starting points,
      not final designs. The generated wireframes are intentionally neutral and
      flexible.
    </p>
    <p>You should expect:</p>
    <ul>
      <li>Clean structure and layout hierarchy</li>
      <li>Fully editable wireframes</li>
      <li>Results optimized for iteration, not visual polish</li>
    </ul>
    <p>You should not expect:</p>
    <ul>
      <li>Pixel-perfect designs</li>
      <li>Brand-specific styling</li>
      <li>Final UI-ready components</li>
    </ul>
    <p>
      AI Generation is most powerful when combined with manual refinement,
      design systems, and wireframe libraries.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Generated wireframe with editable and flexible annotations"
      />
      <figcaption className={styles.imageCaption}>
        Editable and flexible wireframe structure.
      </figcaption>
    </figure>

    <h3>Next step</h3>
    <p>
      Continue to{" "}
      <a href="/docs/ai-generation/page-generation">Page Generation</a> to learn
      how to generate full-page wireframes using AI.
    </p>
  </DocsLayout>
);

export default AIGenerationOverview;
