import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const AIGenerationPage = (): ReactElement => (
  <DocsLayout>
    <h2>Page Generation (Generate Page)</h2>

    <h3>Page generation overview</h3>
    <p>
      Page Generation allows you to create a full-page wireframe using AI,
      without importing an existing website. This mode is designed for
      generating common page layouts such as homepages, pricing pages, blogs,
      or landing pages.
    </p>
    <p>
      Instead of starting from a blank canvas, Web2Wireframe generates a
      complete page structure based on best-practice patterns, giving you a
      strong foundation that you can refine and customize inside Figma.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="AI Generations Generate Page main screen"
      />
      <figcaption className={styles.imageCaption}>
        AI Generations Generate Page main screen.
      </figcaption>
    </figure>
    <p>
      Related:{" "}
      <a href="/docs/ai-generation/overview">AI Generation Overview</a>
    </p>

    <h3>Choosing a viewport</h3>
    <p>
      The viewport setting defines the width of the generated wireframe. This
      allows you to generate layouts optimized for specific screen sizes.
    </p>
    <p>You can choose from common viewport sizes such as:</p>
    <ul>
      <li>Desktop (e.g. 1440px)</li>
      <li>Tablet</li>
      <li>Mobile</li>
    </ul>
    <p>
      Selecting the correct viewport helps ensure that spacing, hierarchy, and
      layout proportions match your intended target device.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Viewport dropdown with selected width"
      />
      <figcaption className={styles.imageCaption}>
        Viewport dropdown with selected width.
      </figcaption>
    </figure>

    <h3>Density modes (Balanced vs Detailed)</h3>
    <p>Density controls how much structural detail is included in the generated wireframe.</p>
    <ul>
      <li>
        Balanced creates a clean, simplified layout focused on major sections
        and hierarchy.
      </li>
      <li>
        Detailed generates a more granular structure with additional elements
        and content placeholders.
      </li>
    </ul>
    <p>
      Use Balanced when you want clarity and speed. Use Detailed when you need
      more guidance and structure from the start.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Balanced versus Detailed comparison"
      />
      <figcaption className={styles.imageCaption}>
        Balanced vs Detailed comparison.
      </figcaption>
    </figure>

    <h3>Selecting a page type (Home, About, Pricing, etc.)</h3>
    <p>
      Page type selection tells Web2Wireframe what kind of page you want to
      generate. Each page type follows a predefined structural logic optimized
      for its purpose.
    </p>
    <p>Common page types include:</p>
    <ul>
      <li>Home</li>
      <li>About</li>
      <li>Pricing</li>
      <li>Contact</li>
      <li>Blog</li>
      <li>Login / Register</li>
      <li>FAQ</li>
    </ul>
    <p>
      Selecting a page type helps AI Generation choose appropriate sections and
      layout flow automatically.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Page type selection buttons"
      />
      <figcaption className={styles.imageCaption}>
        Page type selection buttons.
      </figcaption>
    </figure>

    <h3>Customizing page structure</h3>
    <p>
      Before generating the wireframe, you can customize the page structure to
      better match your needs. This gives you control over which sections
      appear on the page and how the layout is composed.
    </p>
    <p>
      Customization allows you to adapt the generated structure without
      manually rebuilding it later.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Customize structure collapsed and expanded state"
      />
      <figcaption className={styles.imageCaption}>
        Customize structure collapsed and expanded state.
      </figcaption>
    </figure>

    <h3>Enabling and disabling sections</h3>
    <p>
      Within the structure customization panel, you can enable or disable
      individual sections such as:
    </p>
    <ul>
      <li>Hero</li>
      <li>Features</li>
      <li>Testimonials</li>
      <li>Pricing</li>
      <li>FAQ</li>
      <li>Call to Action</li>
      <li>Footer</li>
    </ul>
    <p>
      This lets you generate only the sections you actually need, keeping the
      wireframe focused and relevant.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Section toggles enabled and disabled"
      />
      <figcaption className={styles.imageCaption}>
        Section toggles enabled and disabled.
      </figcaption>
    </figure>

    <h3>Additional notes and requirements</h3>
    <p>
      You can optionally add notes or short requirements before generating the
      page. These notes help guide the AI generation process and provide
      context for the structure.
    </p>
    <p>Use notes to specify:</p>
    <ul>
      <li>Special layout requirements</li>
      <li>Content emphasis</li>
      <li>Structural preferences</li>
    </ul>
    <p>Notes are optional, but useful when you want more control over the result.</p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Notes input field"
      />
      <figcaption className={styles.imageCaption}>
        Notes input field.
      </figcaption>
    </figure>

    <h3>Generating the wireframe</h3>
    <p>
      Once all options are set, click Generate Wireframe to start the
      generation process. Web2Wireframe will create a full-page wireframe
      directly on your Figma canvas.
    </p>
    <p>
      The generated wireframe is fully editable. You can rearrange sections,
      adjust spacing, replace placeholders, or apply your own design system
      immediately.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Generated full-page wireframe on canvas"
      />
      <figcaption className={styles.imageCaption}>
        Generated full-page wireframe on canvas.
      </figcaption>
    </figure>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Page generation demo video placeholder"
      />
      <figcaption className={styles.imageCaption}>
        Configure, generate, edit page wireframe (30s).
      </figcaption>
    </figure>

    <h3>Next step</h3>
    <p>
      Continue to{" "}
      <a href="/docs/ai-generation/block-generation">Block Generation</a> to
      learn how to generate reusable UI blocks using AI.
    </p>
  </DocsLayout>
);

export default AIGenerationPage;
