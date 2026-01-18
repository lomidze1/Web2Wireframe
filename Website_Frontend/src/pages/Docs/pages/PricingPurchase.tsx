import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const PricingPurchase = (): ReactElement => (
  <DocsLayout>
    <h2>Purchase & Subscription</h2>

    <h3>How the subscription model works</h3>
    <p>
      Web2Wireframe uses a subscription-based model to provide ongoing access
      to paid features. Subscriptions are designed to be flexible, allowing
      users to start small and upgrade as their needs grow.
    </p>
    <p>
      A subscription gives you continuous access to paid functionality for the
      duration of your billing period. As long as the subscription is active,
      you can use the included features without interruption.
    </p>
    <p>
      The subscription model is built to support long-term use while keeping
      entry simple for new users.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Subscription model overview diagram"
      />
      <figcaption className={styles.imageCaption}>
        Subscription model overview diagram.
      </figcaption>
    </figure>

    <h3>Step-by-step purchase process</h3>
    <p>
      Purchasing a subscription is a straightforward process designed to
      minimize friction.
    </p>
    <p>The general flow looks like this:</p>
    <ol>
      <li>Choose a plan that fits your needs</li>
      <li>Start the purchase process</li>
      <li>Complete the required checkout steps</li>
      <li>Gain immediate access to paid features</li>
    </ol>
    <p>
      Once the purchase is completed, your account is automatically updated
      and the new features become available right away.
    </p>
    <p>
      Detailed purchase steps and payment options will be displayed during
      checkout.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Purchase flow steps UI"
      />
      <figcaption className={styles.imageCaption}>
        Purchase flow steps UI.
      </figcaption>
    </figure>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Purchase flow walkthrough video placeholder"
      />
      <figcaption className={styles.imageCaption}>
        Purchase flow walkthrough (short).
      </figcaption>
    </figure>

    <h3>Subscription update and cancellation</h3>
    <p>
      You can manage your subscription at any time from your account settings.
      This includes upgrading, downgrading, or canceling your plan.
    </p>
    <p>When updating a subscription:</p>
    <ul>
      <li>Changes take effect according to the selected plan and billing cycle</li>
      <li>Your access adjusts automatically based on the new plan</li>
    </ul>
    <p>When canceling a subscription:</p>
    <ul>
      <li>Access to paid features remains active until the end of the current billing period</li>
      <li>No further charges are applied after cancellation</li>
    </ul>
    <p>
      Clear subscription management ensures you stay in control of your usage
      and costs.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Subscription management settings with update and cancel options"
      />
      <figcaption className={styles.imageCaption}>
        Subscription management settings.
      </figcaption>
    </figure>

    <h3>Next step</h3>
    <p>
      Continue to{" "}
      <a href="/docs/pricing/additional">Additional Information</a> for general
      pricing details, future payments, and other related topics.
    </p>
  </DocsLayout>
);

export default PricingPurchase;
