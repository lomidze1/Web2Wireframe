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
    <p>The Pro plan typically includes:</p>
    <ul>
      <li>Unlimited URL, Screenshot, HTML, and Browser Extension imports</li>
      <li>Full styling: colors, fonts, and all viewports</li>
      <li>Real text content, hover state capture, and assets</li>
      <li>Font binary download (ZIP + auto-install)</li>
      <li>Priority email support</li>
    </ul>
    <p>Paid features focus on productivity and scale, not on restricting core functionality.</p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Free versus Pro feature highlights"
      />
      <figcaption className={styles.imageCaption}>
        Free vs Pro feature highlights.
      </figcaption>
    </figure>

    <h3>Available plan types</h3>
    <p>
      Web2Wireframe ships with a simple, two-tier plan structure.
    </p>
    <p>Plan types:</p>
    <ul>
      <li>Free — 10 imports per month, for exploration and occasional use</li>
      <li>Pro $16/month — unlimited imports and full features</li>
    </ul>
    <p>
      Additional options may be introduced over time as new features
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

    <h3>Why the paid plan exists</h3>
    <p>
      The Pro plan supports the ongoing development and maintenance of
      Web2Wireframe. Advanced features such as multi-viewport capture, hover
      state extraction, and font handling require infrastructure and
      continuous improvement.
    </p>
    <p>By offering the Pro plan, Web2Wireframe can:</p>
    <ul>
      <li>Improve performance and stability</li>
      <li>Add new capabilities over time</li>
      <li>Support long-term product growth</li>
    </ul>
    <p>Pro keeps the product sustainable while leaving core features accessible on Free.</p>

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
      <li>Choose the Free plan if you are exploring the product or running fewer than 10 imports per month</li>
      <li>Choose the Pro plan if you import websites frequently and need full styling, viewports, and assets</li>
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
