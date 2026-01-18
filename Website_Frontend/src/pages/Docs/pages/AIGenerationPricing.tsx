import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const AIGenerationPricing = (): ReactElement => (
  <DocsLayout>
    <h2>AI Generation Pricing & Availability</h2>

    <h3>AI Generation in the free plan</h3>
    <p>
      AI Generation is available in the free plan with limited access. This
      allows new users to explore how AI-powered Page and Block Generation
      works before committing to a paid plan.
    </p>
    <p>In the free plan, AI Generation is intended for:</p>
    <ul>
      <li>Trying out basic page or block generation</li>
      <li>Understanding structure and workflow</li>
      <li>Evaluating whether AI Generation fits your process</li>
    </ul>
    <p>
      Free access helps you get familiar with the feature, but it is not
      designed for extended or high-volume usage.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Free plan badge or limited usage indicator in UI"
      />
      <figcaption className={styles.imageCaption}>
        Free plan badge or limited usage indicator.
      </figcaption>
    </figure>

    <h3>Usage limits and restrictions</h3>
    <p>
      To ensure fair usage and system stability, AI Generation is subject to
      limits depending on your plan.
    </p>
    <p>Limits may include:</p>
    <ul>
      <li>Number of AI generations per month</li>
      <li>Available page or block types</li>
      <li>Access to advanced density or customization options</li>
    </ul>
    <p>
      Once limits are reached, AI Generation may be temporarily unavailable
      until the next usage cycle or require an upgrade to continue.
    </p>
    <p>
      Clear limits help keep the system reliable and predictable for all users.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Usage limit reached or counter example"
      />
      <figcaption className={styles.imageCaption}>
        Usage limit reached or counter example.
      </figcaption>
    </figure>

    <h3>Benefits of paid plans</h3>
    <p>
      Paid plans unlock extended access to AI Generation and are designed for
      users who rely on AI-assisted workflows regularly.
    </p>
    <p>Benefits typically include:</p>
    <ul>
      <li>Higher or unlimited AI generation usage</li>
      <li>Access to more page and block types</li>
      <li>Advanced structure and density options</li>
      <li>Faster iteration across multiple projects</li>
      <li>Better alignment with professional and team workflows</li>
    </ul>
    <p>
      Paid plans are best suited for designers, teams, and agencies who use AI
      Generation as a core part of their daily work.
    </p>
    <p>
      Related: <a href="/docs/pricing">Pricing Overview</a>
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Comparison of free versus paid features"
      />
      <figcaption className={styles.imageCaption}>
        Free vs Paid feature comparison.
      </figcaption>
    </figure>

    <h3>When upgrading makes sense</h3>
    <p>
      Upgrading to a paid plan makes sense when AI Generation becomes a regular
      part of your workflow rather than an occasional tool.
    </p>
    <p>You may want to upgrade if:</p>
    <ul>
      <li>You frequently generate pages or blocks using AI</li>
      <li>You need consistent structure across many projects</li>
      <li>You want to reuse AI-generated blocks at scale</li>
      <li>You work in a team environment</li>
      <li>You want fewer interruptions from usage limits</li>
    </ul>
    <p>
      AI Generation delivers the most value when it supports continuous
      iteration and reuse, not just one-time experiments.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Workflow scale-up illustration"
      />
      <figcaption className={styles.imageCaption}>
        Workflow scale-up illustration.
      </figcaption>
    </figure>

    <h3>Next step</h3>
    <p>
      You've now explored all AI Generation features. Continue to{" "}
      <a href="/docs/library/overview">Library</a> to learn how to store, reuse,
      and share generated wireframes.
    </p>
  </DocsLayout>
);

export default AIGenerationPricing;
