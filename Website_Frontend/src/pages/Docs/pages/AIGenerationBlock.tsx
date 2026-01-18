import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const AIGenerationBlock = (): ReactElement => (
  <DocsLayout>
    <h2>Block Generation (Generate Block)</h2>

    <h3>Block generation overview</h3>
    <p>
      Block Generation allows you to generate individual wireframe blocks using
      AI, instead of creating a full page. Blocks represent reusable UI
      sections such as heroes, headers, pricing tables, testimonials, or
      footers.
    </p>
    <p>
      This mode is designed for modular workflows. You can generate standalone
      blocks and reuse them across multiple pages, helping you build layouts
      faster and maintain consistency throughout your project.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="AI Generations Generate Block main screen"
      />
      <figcaption className={styles.imageCaption}>
        AI Generations Generate Block main screen.
      </figcaption>
    </figure>
    <p>
      Related:{" "}
      <a href="/docs/ai-generation/overview">AI Generation Overview</a>
    </p>

    <h3>Choosing viewports for blocks</h3>
    <p>
      When generating a block, you can select one or multiple viewports. This
      allows you to generate the same block optimized for different screen
      sizes.
    </p>
    <p>Common viewport options include:</p>
    <ul>
      <li>Desktop (e.g. 1440px)</li>
      <li>Tablet (e.g. 1024px)</li>
      <li>Mobile (e.g. 768px, 375px)</li>
    </ul>
    <p>
      Generating blocks for multiple viewports helps ensure responsive
      structure and makes it easier to reuse blocks across different layouts.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Viewport selector with multiple sizes selected"
      />
      <figcaption className={styles.imageCaption}>
        Viewport selector with multiple sizes selected.
      </figcaption>
    </figure>

    <h3>Density modes for blocks</h3>
    <p>Density controls how detailed the generated block structure will be.</p>
    <ul>
      <li>
        Balanced creates a clean, high-level block structure focused on layout
        and hierarchy.
      </li>
      <li>
        Detailed generates a more complex block with additional internal
        elements and placeholders.
      </li>
    </ul>
    <p>
      Use Balanced when you want flexibility and speed. Use Detailed when you
      want a more defined starting point for a specific block.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Balanced versus Detailed block comparison"
      />
      <figcaption className={styles.imageCaption}>
        Balanced vs Detailed block comparison.
      </figcaption>
    </figure>

    <h3>Selecting a block type (Hero, Header, Pricing, etc.)</h3>
    <p>
      Block type selection tells Web2Wireframe what kind of UI block to
      generate. Each block type follows predefined structural patterns
      optimized for its purpose.
    </p>
    <p>Common block types include:</p>
    <ul>
      <li>Hero</li>
      <li>Header</li>
      <li>Footer</li>
      <li>Pricing</li>
      <li>Testimonials</li>
      <li>FAQ</li>
      <li>Call to Action</li>
      <li>Team</li>
      <li>Features</li>
    </ul>
    <p>
      Selecting the correct block type helps AI Generation create a structure
      that fits naturally into a page layout.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Block type selection buttons"
      />
      <figcaption className={styles.imageCaption}>
        Block type selection buttons.
      </figcaption>
    </figure>

    <h3>Reusing blocks across multiple pages</h3>
    <p>
      One of the main advantages of Block Generation is reusability. Generated
      blocks can be reused across multiple pages within the same project or
      across different projects.
    </p>
    <p>You can:</p>
    <ul>
      <li>Insert the same block into multiple pages</li>
      <li>Combine blocks generated at different times</li>
      <li>Store blocks in your library for future use</li>
    </ul>
    <p>
      This modular approach reduces repetitive work and helps maintain
      consistent structure across your designs.
    </p>
    <p>
      Related: <a href="/docs/library/overview">Library Overview</a>
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

    <h3>Block generation result in Figma</h3>
    <p>
      After generation, the block appears directly on your Figma canvas as a
      fully editable wireframe. All elements are grouped logically and can be
      modified without restrictions.
    </p>
    <p>You can immediately:</p>
    <ul>
      <li>Adjust spacing and alignment</li>
      <li>Rearrange internal elements</li>
      <li>Apply your design system</li>
      <li>Combine the block with other wireframes</li>
    </ul>
    <p>
      Block Generation gives you flexible building blocks that adapt to your
      workflow rather than locking you into fixed layouts.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Generated block selected on Figma canvas"
      />
      <figcaption className={styles.imageCaption}>
        Generated block selected on Figma canvas.
      </figcaption>
    </figure>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Block generation demo video placeholder"
      />
      <figcaption className={styles.imageCaption}>
        Generate block, reuse, edit (20-30s).
      </figcaption>
    </figure>

    <h3>Next step</h3>
    <p>
      Continue to{" "}
      <a href="/docs/ai-generation/pricing">
        AI Generation Pricing & Availability
      </a>{" "}
      to learn about usage limits and plan differences.
    </p>
  </DocsLayout>
);

export default AIGenerationBlock;
