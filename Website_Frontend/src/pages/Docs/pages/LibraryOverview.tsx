import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const LibraryOverview = (): ReactElement => (
  <DocsLayout>
    <h2>Library Overview</h2>

    <h3>What is the Web2Wireframe Library</h3>
    <p>
      The Web2Wireframe Library is a centralized space where generated and
      imported wireframes are stored, organized, and reused. It allows you to
      manage pages and blocks created through imports, AI generation, and other
      workflows in one place.
    </p>
    <p>
      Instead of recreating layouts repeatedly, the library helps you build a
      growing collection of reusable wireframes that can be applied across
      multiple projects. This turns your work into a long-term asset rather
      than a one-time result.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Library main screen showing wireframe grid or list"
      />
      <figcaption className={styles.imageCaption}>
        Library main screen with wireframes.
      </figcaption>
    </figure>
    <p>
      Related:{" "}
      <a href="/docs/ai-generation/overview">AI Generation</a>
    </p>

    <h3>Difference between My Library and Community Library</h3>
    <p>
      The Web2Wireframe Library is divided into two main parts: My Library and
      Community Library, each serving a different purpose.
    </p>
    <p>
      My Library contains your personal wireframes. This includes pages and
      blocks you imported, generated with AI, or saved for later use. It is
      private to your account and focused on reuse within your own workflow.
    </p>
    <p>
      Community Library is a shared collection of wireframes created and
      shared by the Web2Wireframe community. It allows you to explore common
      layouts, discover patterns, and reuse structures created by other users.
    </p>
    <p>
      Together, these two libraries balance personal productivity with shared
      inspiration and reuse.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="My Library and Community Library tabs highlighted"
      />
      <figcaption className={styles.imageCaption}>
        My Library vs Community Library.
      </figcaption>
    </figure>
    <p>
      Related: <a href="/docs/library/my-library">My Library</a>
      <br />
      Related: <a href="/docs/library/community-library">Community Library</a>
    </p>

    <h3>How the library speeds up your workflow</h3>
    <p>
      The library is designed to reduce repetitive work and help you move
      faster as projects grow. By reusing existing wireframes instead of
      starting from scratch, you can focus more on decision-making and
      refinement.
    </p>
    <p>Using the library allows you to:</p>
    <ul>
      <li>Reuse pages and blocks across multiple projects</li>
      <li>Maintain consistent structure and layout patterns</li>
      <li>Build modular wireframes from proven components</li>
      <li>Scale your workflow without increasing setup time</li>
    </ul>
    <p>
      Over time, the library becomes a foundation for faster iteration and more
      consistent design outcomes.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Reusing a block from the library across multiple pages"
      />
      <figcaption className={styles.imageCaption}>
        Reusing a block across multiple pages.
      </figcaption>
    </figure>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Library overview video placeholder"
      />
      <figcaption className={styles.imageCaption}>
        Save to library, reuse in another page (20-30s).
      </figcaption>
    </figure>

    <h3>Next step</h3>
    <p>
      Continue to <a href="/docs/library/my-library">My Library</a> to learn how
      to manage, organize, and reuse your own wireframes.
    </p>
  </DocsLayout>
);

export default LibraryOverview;
