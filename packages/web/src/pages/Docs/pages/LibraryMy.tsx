import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const LibraryMy = (): ReactElement => (
  <DocsLayout>
    <h2>My Library</h2>

    <h3>Purpose of My Library</h3>
    <p>
      My Library is your personal workspace for storing and reusing wireframes
      created with Web2Wireframe. It contains all pages and blocks that you
      generate or import and choose to keep for future use.
    </p>
    <p>
      The main purpose of My Library is reuse. Instead of generating or
      importing the same structures repeatedly, you can build a personal
      collection of wireframes that grow with your projects.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="My Library main view with personal wireframes"
      />
      <figcaption className={styles.imageCaption}>
        My Library with personal wireframes.
      </figcaption>
    </figure>
    <p>
      Related: <a href="/docs/library/overview">Library Overview</a>
    </p>

    <h3>Web Imported wireframes</h3>
    <p>
      Wireframes created using Web Import, Screenshot Import, HTML Import, or
      Area Capture can be saved to My Library. These wireframes are useful when
      working with existing websites or reference material.
    </p>
    <p>
      Imported wireframes preserve structural hierarchy and can be reused,
      edited, or combined with other wireframes later.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Web imported wireframe card with source label"
      />
      <figcaption className={styles.imageCaption}>
        Web imported wireframe with source label.
      </figcaption>
    </figure>
    <p>
      Related: <a href="/docs/import-methods">Import Methods</a>
    </p>

    <h3>AI Generated wireframes</h3>
    <p>
      Wireframes generated using AI Generation can also be saved to My Library.
      This includes both full pages and individual blocks created through Page
      Generation or Block Generation.
    </p>
    <p>
      AI-generated wireframes are ideal for reuse because they follow
      consistent structural patterns and are easy to adapt across projects.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="AI Generated wireframes grouped in My Library"
      />
      <figcaption className={styles.imageCaption}>
        AI Generated wireframes in My Library.
      </figcaption>
    </figure>
    <p>
      Related:{" "}
      <a href="/docs/ai-generation/overview">AI Generation Overview</a>
    </p>

    <h3>Pages vs Blocks</h3>
    <p>
      My Library organizes content into Pages and Blocks, making it easier to
      manage and reuse wireframes efficiently.
    </p>
    <ul>
      <li>
        Pages represent full layouts, such as homepages or pricing pages
      </li>
      <li>
        Blocks represent individual sections, such as heroes, testimonials, or
        pricing tables
      </li>
    </ul>
    <p>
      Pages are best for complete flows, while blocks are ideal for modular
      design and quick assembly of layouts.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Toggle or filter showing Pages versus Blocks"
      />
      <figcaption className={styles.imageCaption}>
        Pages vs Blocks filter.
      </figcaption>
    </figure>

    <h3>Opening and deleting wireframes</h3>
    <p>
      You can open any wireframe from My Library directly into your current
      Figma file. This allows you to continue working without re-importing or
      regenerating content.
    </p>
    <p>
      If a wireframe is no longer needed, it can be deleted from My Library to
      keep your workspace clean and focused.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Context menu with Open and Delete actions"
      />
      <figcaption className={styles.imageCaption}>
        Open and Delete actions.
      </figcaption>
    </figure>

    <h3>Adding wireframes to Favorites</h3>
    <p>
      Favorites help you quickly access frequently used wireframes. By marking
      a wireframe as a favorite, it becomes easier to find and reuse across
      different projects.
    </p>
    <p>
      Favorites are especially useful for commonly reused blocks or standard
      page layouts.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Favorite icon highlighted on a wireframe card"
      />
      <figcaption className={styles.imageCaption}>
        Favorite icon on a wireframe card.
      </figcaption>
    </figure>

    <h3>Filters and sorting</h3>
    <p>
      My Library includes filtering and sorting tools to help you manage large
      collections of wireframes.
    </p>
    <p>You can filter and sort by:</p>
    <ul>
      <li>Viewport (Desktop, Tablet, Mobile)</li>
      <li>Source (Web Import, AI Generation, Screenshot, etc.)</li>
      <li>Sort order (Newest, Oldest, Name)</li>
    </ul>
    <p>
      These controls help you quickly locate the wireframe you need, even as
      your library grows.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Filter panel with Viewport and Source options"
      />
      <figcaption className={styles.imageCaption}>
        Filter panel with Viewport and Source options.
      </figcaption>
    </figure>

    <h3>Best practices for using My Library</h3>
    <p>To get the most value from My Library:</p>
    <ul>
      <li>Save reusable blocks instead of regenerating them</li>
      <li>Use consistent naming for pages and blocks</li>
      <li>Favorite frequently used wireframes</li>
      <li>Clean up unused items periodically</li>
    </ul>
    <p>
      Over time, My Library becomes a powerful productivity tool rather than
      just storage.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Organized My Library with clear naming and favorites"
      />
      <figcaption className={styles.imageCaption}>
        Organized My Library with clear naming and favorites.
      </figcaption>
    </figure>

    <h3>Next step</h3>
    <p>
      Continue to{" "}
      <a href="/docs/library/community-library">Community Library</a> to explore
      shared wireframes created by other users.
    </p>
  </DocsLayout>
);

export default LibraryMy;
