import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const PricingPurchase = (): ReactElement => (
  <DocsLayout>
    <h2>Purchase & Access</h2>

    <h3>How the one-time purchase model works</h3>
    <p>
      Web2Wireframe Pro is a one-time purchase. A single $16 payment unlocks 30
      days of Pro access — there is no recurring subscription and you are never
      charged automatically.
    </p>
    <p>
      For the 30 days your access is active, you can use every Pro feature
      without interruption. When the period ends, your account returns to the
      Free tier unless you choose to buy again.
    </p>
    <p>
      This keeps things simple and predictable: you always know exactly when
      and how much you'll be charged, because nothing happens unless you start
      a purchase yourself.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="One-time purchase model overview diagram"
      />
      <figcaption className={styles.imageCaption}>
        One-time purchase model overview diagram.
      </figcaption>
    </figure>

    <h3>Step-by-step purchase process</h3>
    <p>
      Buying Pro is a straightforward process designed to minimize friction.
    </p>
    <p>The general flow looks like this:</p>
    <ol>
      <li>Open the Plan modal in the plugin and choose Pro</li>
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

    <h3>Renewing your access</h3>
    <p>
      Because Pro does not auto-renew, there is nothing to cancel — access
      simply ends when the 30 days are up. To keep Pro, you make another
      one-time purchase.
    </p>
    <ul>
      <li>
        Renew any time from the Plan modal in the plugin, or from the link in
        your expiry reminder email
      </li>
      <li>
        Renewing early stacks the new 30 days onto your remaining time — no
        days are lost
      </li>
      <li>
        We email you a reminder a few days before your access is due to expire
      </li>
    </ul>
    <p>
      You stay fully in control of your usage and costs — you are only ever
      charged when you choose to buy.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Plan modal with renew option"
      />
      <figcaption className={styles.imageCaption}>
        Renewing Pro access from the Plan modal.
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
