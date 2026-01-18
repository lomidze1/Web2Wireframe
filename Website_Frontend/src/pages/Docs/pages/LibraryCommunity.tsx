import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const LibraryCommunity = (): ReactElement => (
  <DocsLayout>
    <h2>Community Library</h2>

    <h3>What is the Community Library</h3>
    <p>
      The Community Library is a shared space where Web2Wireframe users can
      explore wireframes created and shared by the community. It contains
      reusable page layouts and blocks that reflect common design patterns and
      real-world use cases.
    </p>
    <p>
      The Community Library helps you learn from others, discover proven
      structures, and accelerate your workflow by reusing layouts instead of
      starting from scratch.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Community Library main view with shared wireframe cards"
      />
      <figcaption className={styles.imageCaption}>
        Community Library with shared wireframe cards.
      </figcaption>
    </figure>
    <p>
      Related: <a href="/docs/library/overview">Library Overview</a>
    </p>

    <h3>Browsing community wireframes</h3>
    <p>
      You can browse the Community Library directly from the Library section.
      Wireframes are presented in a visual grid, making it easy to scan,
      preview, and select layouts that match your needs.
    </p>
    <p>Each wireframe card provides key information such as:</p>
    <ul>
      <li>Page or block type</li>
      <li>Viewport</li>
      <li>Category</li>
      <li>Popularity indicators</li>
    </ul>
    <p>
      Browsing is designed to be fast and exploratory, helping you quickly
      find relevant structures.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Community Library browsing grid"
      />
      <figcaption className={styles.imageCaption}>
        Community Library browsing grid.
      </figcaption>
    </figure>

    <h3>Categories and tags (Landing, Pricing, Hero, etc.)</h3>
    <p>
      Community wireframes are organized using categories and tags to make
      discovery easier. Categories reflect common layout purposes, while tags
      provide additional context.
    </p>
    <p>Common categories and tags include:</p>
    <ul>
      <li>Landing</li>
      <li>Pricing</li>
      <li>Hero</li>
      <li>Features</li>
      <li>Testimonials</li>
      <li>Blog</li>
      <li>Footer</li>
    </ul>
    <p>
      Using categories and tags helps narrow down results and find wireframes
      that fit specific design goals.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Category and tag filters highlighted"
      />
      <figcaption className={styles.imageCaption}>
        Category and tag filters.
      </figcaption>
    </figure>

    <h3>Popular and most downloaded items</h3>
    <p>
      The Community Library highlights popular and frequently downloaded
      wireframes. These items represent structures that many users find useful
      and reliable.
    </p>
    <p>Popular wireframes are a good starting point when:</p>
    <ul>
      <li>You are unsure where to begin</li>
      <li>You want proven layout patterns</li>
      <li>You need inspiration based on real usage</li>
    </ul>
    <p>
      Popularity indicators help guide decisions without requiring deep
      comparison.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Popular or most downloaded section highlighted"
      />
      <figcaption className={styles.imageCaption}>
        Popular and most downloaded items.
      </figcaption>
    </figure>

    <h3>Using community wireframes</h3>
    <p>
      Community wireframes can be used directly in your projects. When you
      select a wireframe, you can insert it into your current Figma file and
      customize it freely.
    </p>
    <p>Once imported, a community wireframe behaves like any other wireframe:</p>
    <ul>
      <li>Fully editable</li>
      <li>Can be combined with other blocks</li>
      <li>Can be adapted to your design system</li>
    </ul>
    <p>
      Using community wireframes saves time while still allowing full creative
      control.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Community wireframe inserted into Figma canvas"
      />
      <figcaption className={styles.imageCaption}>
        Community wireframe inserted into Figma.
      </figcaption>
    </figure>
    <p>
      Related: <a href="/docs/library/my-library">My Library</a>
    </p>

    <h3>Best practices for using Community Library</h3>
    <p>To get the most value from the Community Library:</p>
    <ul>
      <li>Treat community wireframes as starting points, not final solutions</li>
      <li>Combine multiple community blocks to build unique layouts</li>
      <li>Adapt structures to match your project goals</li>
      <li>Save useful wireframes to My Library for reuse</li>
    </ul>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Community block reused and customized"
      />
      <figcaption className={styles.imageCaption}>
        Community block reused and customized.
      </figcaption>
    </figure>

    <h3>Next step</h3>
    <p>
      Continue to{" "}
      <a href="/docs/library/contributing">Contributing to the Community</a> to
      learn how to share your own wireframes with other users.
    </p>
  </DocsLayout>
);

export default LibraryCommunity;
