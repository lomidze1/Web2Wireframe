import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const LibraryBestPractices = (): ReactElement => (
  <DocsLayout>
    <h2>Best Practices for Using the Library</h2>

    <h3>When to use My Library</h3>
    <p>
      Use My Library when you are working with wireframes that are specific to
      your projects, clients, or internal workflows. It is best suited for
      content you plan to reuse privately and refine over time.
    </p>
    <p>My Library works best when:</p>
    <ul>
      <li>You want to reuse your own pages or blocks</li>
      <li>You are building a consistent internal structure</li>
      <li>You need quick access to previously generated wireframes</li>
      <li>You are iterating on the same layouts across multiple files</li>
    </ul>
    <p>Treat My Library as your personal collection of proven structures.</p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="My Library with frequently used wireframes highlighted"
      />
      <figcaption className={styles.imageCaption}>
        Frequently used wireframes highlighted in My Library.
      </figcaption>
    </figure>
    <p>
      Related: <a href="/docs/library/my-library">My Library</a>
    </p>

    <h3>When to use Community Library</h3>
    <p>
      Use Community Library when you want inspiration, proven patterns, or a
      quick starting point created by other users. Community wireframes are
      ideal when you do not want to start from scratch or when exploring new
      layout ideas.
    </p>
    <p>Community Library works best when:</p>
    <ul>
      <li>You are exploring new page or block structures</li>
      <li>You want common, widely used layout patterns</li>
      <li>You need a fast starting point for a new section</li>
      <li>You want to learn from how others structure pages</li>
    </ul>
    <p>
      Community wireframes should be treated as flexible building blocks, not
      final designs.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Community Library browsing view"
      />
      <figcaption className={styles.imageCaption}>
        Community Library browsing view.
      </figcaption>
    </figure>
    <p>
      Related: <a href="/docs/library/community-library">Community Library</a>
    </p>

    <h3>Reusing blocks across multiple pages</h3>
    <p>
      Blocks are designed to be reused. Generating or saving blocks in the
      library allows you to apply the same structure across multiple pages
      without rebuilding it each time.
    </p>
    <p>Best practices for block reuse:</p>
    <ul>
      <li>Save frequently used blocks to My Library</li>
      <li>Reuse the same block across different pages</li>
      <li>Modify blocks slightly instead of creating new ones</li>
      <li>Combine blocks to build complete layouts</li>
    </ul>
    <p>
      Reusing blocks reduces repetition and helps maintain structural
      consistency.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Same block reused on multiple pages"
      />
      <figcaption className={styles.imageCaption}>
        Same block reused on multiple pages.
      </figcaption>
    </figure>

    <h3>Using the library for design consistency</h3>
    <p>
      One of the biggest advantages of the library is consistency. By reusing
      the same pages and blocks, you ensure that layouts follow the same
      structural logic across projects.
    </p>
    <p>Using the library for consistency helps:</p>
    <ul>
      <li>Maintain predictable layout patterns</li>
      <li>Improve collaboration within teams</li>
      <li>Reduce structural inconsistencies</li>
      <li>Speed up onboarding for new team members</li>
    </ul>
    <p>
      Over time, your library becomes a shared structural system that supports
      faster and more reliable design decisions.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Multiple pages sharing the same layout structure"
      />
      <figcaption className={styles.imageCaption}>
        Multiple pages sharing the same layout structure.
      </figcaption>
    </figure>

    <h3>Next step</h3>
    <p>
      Continue to{" "}
      <a href="/docs/library/value">Value of the Library in Your Workflow</a> to
      understand the long-term benefits of building and maintaining a wireframe
      library.
    </p>
  </DocsLayout>
);

export default LibraryBestPractices;
