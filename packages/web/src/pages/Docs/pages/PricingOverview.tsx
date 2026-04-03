import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const PricingOverview = (): ReactElement => (
  <DocsLayout>
    <h2>Pricing Overview</h2>

    <h3>What is included in Web2Wireframe's paid features</h3>
    <p>
      Web2Wireframe offers both free and paid functionality. Paid features are
      designed for users who rely on the product regularly and need more
      flexibility, scale, and control.
    </p>
    <p>Paid plans typically include:</p>
    <ul>
      <li>Extended access to AI Generation for pages and blocks</li>
      <li>
        Full use of advanced generation options and structure customization
      </li>
      <li>
        Increased ability to reuse and manage wireframes in the library
      </li>
      <li>A smoother workflow for ongoing projects and teams</li>
    </ul>
    <p>Paid features focus on productivity and scale, not on restricting core functionality.</p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Free versus Paid feature highlights"
      />
      <figcaption className={styles.imageCaption}>
        Free vs Paid feature highlights.
      </figcaption>
    </figure>
    <p>
      Related:{" "}
      <a href="/docs/ai-generation/pricing">AI Generation Pricing & Availability</a>
    </p>

    <h3>Available plan types</h3>
    <p>
      Web2Wireframe is designed around a simple plan structure that grows with
      your needs.
    </p>
    <p>Common plan types include:</p>
    <ul>
      <li>Free - for exploration, testing, and occasional use</li>
      <li>Paid plans - for regular use, advanced workflows, and larger projects</li>
    </ul>
    <p>
      Additional plan options may be introduced over time as new features
      become available.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Simple plan tiers overview"
      />
      <figcaption className={styles.imageCaption}>
        Simple plan tiers overview.
      </figcaption>
    </figure>

    <h3>Why paid plans exist</h3>
    <p>
      Paid plans exist to support the ongoing development and maintenance of
      Web2Wireframe. Advanced features such as AI Generation and library
      management require infrastructure and continuous improvement.
    </p>
    <p>By offering paid plans, Web2Wireframe can:</p>
    <ul>
      <li>Maintain reliable AI-powered features</li>
      <li>Improve performance and stability</li>
      <li>Add new capabilities over time</li>
      <li>Support long-term product growth</li>
    </ul>
    <p>Paid plans ensure the product remains sustainable while keeping core features accessible.</p>

    <h3>Comparison between free and paid plans</h3>
    <p>
      The free plan allows you to understand how Web2Wireframe works and try
      its core workflows. Paid plans extend these capabilities for users who
      need more frequent usage and deeper control.
    </p>
    <p>In general:</p>
    <ul>
      <li>Free plans are best for learning and light usage</li>
      <li>Paid plans are better for production workflows and repeated use</li>
    </ul>
    <p>
      A detailed comparison will be available as pricing becomes fully active.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Comparison table placeholder"
      />
      <figcaption className={styles.imageCaption}>
        Comparison table placeholder.
      </figcaption>
    </figure>

    <h3>Which plan fits different needs</h3>
    <p>
      Choosing the right plan depends on how often and how deeply you use
      Web2Wireframe.
    </p>
    <ul>
      <li>Choose the Free plan if you are exploring the product or using it occasionally</li>
      <li>Choose a Paid plan if you generate wireframes frequently or rely on AI Generation</li>
      <li>Consider upgrading when Web2Wireframe becomes part of your regular workflow</li>
    </ul>
    <p>
      You can start free and move to a paid plan later as your needs grow.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="User journey from Free to Paid upgrade path"
      />
      <figcaption className={styles.imageCaption}>
        User journey: Free to Paid upgrade path.
      </figcaption>
    </figure>

    <h3>Next step</h3>
    <p>
      Continue to{" "}
      <a href="/docs/pricing/purchase">Purchase & Subscription</a> to learn how
      buying, updating, and canceling subscriptions works.
    </p>
  </DocsLayout>
);

export default PricingOverview;
