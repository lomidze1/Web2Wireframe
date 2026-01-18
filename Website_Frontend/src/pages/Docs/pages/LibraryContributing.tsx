import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const LibraryContributing = (): ReactElement => (
  <DocsLayout>
    <h2>Contributing to the Community</h2>

    <h3>Who can contribute</h3>
    <p>
      Any Web2Wireframe user can contribute wireframes to the Community
      Library. Contributions are designed to be open and accessible,
      encouraging users to share useful structures and patterns with others.
    </p>
    <p>
      You do not need to be a professional designer to contribute. If a
      wireframe represents a clear, reusable structure, it can be valuable to
      the community.
    </p>
    <p>
      Contributing is optional, but it helps grow a shared collection of
      layouts that benefit everyone.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Community Library with Contribute or Share action highlighted"
      />
      <figcaption className={styles.imageCaption}>
        Contribute or Share action highlighted.
      </figcaption>
    </figure>

    <h3>How to share your wireframes</h3>
    <p>
      Sharing a wireframe to the Community Library is a simple process. From
      your library or project, you can choose a wireframe and mark it for
      community sharing.
    </p>
    <p>When sharing, you may be asked to:</p>
    <ul>
      <li>Select whether the wireframe is a Page or Block</li>
      <li>Choose relevant categories and tags</li>
      <li>Add a short description or title</li>
    </ul>
    <p>
      This information helps others discover and understand how the wireframe
      can be used.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Share to Community modal with fields"
      />
      <figcaption className={styles.imageCaption}>
        Share to Community modal.
      </figcaption>
    </figure>
    <p>
      Related: <a href="/docs/library/my-library">My Library</a>
    </p>

    <h3>Visibility and attribution</h3>
    <p>
      When you share a wireframe with the community, it becomes visible to
      other users in the Community Library. Your contribution is attributed to
      you, helping others understand the source of the wireframe.
    </p>
    <p>Attribution ensures:</p>
    <ul>
      <li>Transparency</li>
      <li>Recognition for contributors</li>
      <li>Trust in shared content</li>
    </ul>
    <p>
      Community wireframes are intended to be reused and adapted, not copied as
      final designs.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Wireframe card showing author attribution"
      />
      <figcaption className={styles.imageCaption}>
        Wireframe card with author attribution.
      </figcaption>
    </figure>

    <h3>Downloads and usage metrics</h3>
    <p>
      Community wireframes may display basic usage metrics, such as downloads
      or popularity indicators. These metrics help users identify wireframes
      that others find useful.
    </p>
    <p>
      For contributors, usage metrics provide insight into how their
      wireframes are being used by the community. High engagement can indicate
      that a structure solves a common problem or fits many workflows.
    </p>
    <p>
      Metrics are informational and not competitive. Their purpose is to guide
      discovery and encourage quality contributions.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Download count or usage indicator on wireframe card"
      />
      <figcaption className={styles.imageCaption}>
        Download count or usage indicator.
      </figcaption>
    </figure>

    <h3>Best practices for contributing</h3>
    <p>To make your contributions more valuable:</p>
    <ul>
      <li>Share clean, well-structured wireframes</li>
      <li>Avoid project-specific or branded content</li>
      <li>Use clear names and accurate tags</li>
      <li>Focus on reusable patterns</li>
    </ul>
    <p>
      High-quality contributions improve the overall value of the Community
      Library.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Clean reusable wireframe ready for sharing"
      />
      <figcaption className={styles.imageCaption}>
        Clean reusable wireframe ready for sharing.
      </figcaption>
    </figure>

    <h3>Next step</h3>
    <p>
      Continue to <a href="/docs/library/value">Value of the Library</a> to
      understand how the library supports long-term workflows and
      collaboration.
    </p>
  </DocsLayout>
);

export default LibraryContributing;
