import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const LibraryValue = (): ReactElement => (
  <DocsLayout>
    <h2>Value of the Library in Your Workflow</h2>

    <h3>Saving time with reusable structures</h3>
    <p>
      The Web2Wireframe Library helps you save time by turning wireframes into
      reusable building blocks. Instead of recreating layouts for each project,
      you can reuse existing pages and blocks from your library.
    </p>
    <p>
      Reusable structures reduce setup time and allow you to move directly into
      iteration and refinement. Over time, this leads to faster project starts
      and more efficient workflows.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Timeline comparison from scratch versus library reuse"
      />
      <figcaption className={styles.imageCaption}>
        Timeline comparison: from scratch vs library reuse.
      </figcaption>
    </figure>
    <p>
      Related: <a href="/docs/library/my-library">My Library</a>
    </p>

    <h3>Supporting collaboration and reuse</h3>
    <p>
      The library supports collaboration by creating a shared source of
      structural truth. Teams can reuse the same pages and blocks, ensuring
      everyone works from the same layout patterns.
    </p>
    <p>
      This reduces misunderstandings and helps align design decisions early.
      Whether working solo or in a team, the library enables consistent reuse
      without duplication of effort.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Team members using the same library blocks"
      />
      <figcaption className={styles.imageCaption}>
        Team members using the same library blocks.
      </figcaption>
    </figure>

    <h3>The library as a long-term design asset</h3>
    <p>
      Over time, the library becomes more than just storage. It evolves into a
      long-term design asset that reflects proven structures and workflows.
    </p>
    <p>A well-maintained library:</p>
    <ul>
      <li>Captures knowledge from past projects</li>
      <li>Reduces reliance on starting from scratch</li>
      <li>Scales with your work and experience</li>
      <li>Supports long-term consistency</li>
    </ul>
    <p>
      By investing in your library, you build a foundation that continues to
      deliver value as your projects and workflows grow.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Growing library over time illustration"
      />
      <figcaption className={styles.imageCaption}>
        Growing library over time.
      </figcaption>
    </figure>

    <h3>Next step</h3>
    <p>
      You've now completed the full Library section. Continue to{" "}
      <a href="/docs/pricing">Pricing & Subscription Overview</a> to learn how
      plans and subscriptions work.
    </p>
  </DocsLayout>
);

export default LibraryValue;
