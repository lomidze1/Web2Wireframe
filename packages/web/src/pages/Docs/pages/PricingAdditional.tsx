import type { ReactElement } from "react";
import DocsLayout from "../DocsLayout";
import styles from "../Docs.module.scss";

const PricingAdditional = (): ReactElement => (
  <DocsLayout>
    <h2>Additional Information</h2>

    <h3>General information about pricing and plans</h3>
    <p>
      Pricing and plans in Web2Wireframe are designed to be clear and
      predictable. The goal is to provide transparency around what is included
      in each plan and how access to features works.
    </p>
    <p>
      Details such as available plans, included features, and general terms are
      presented to help users make informed decisions. As the product evolves,
      pricing information may be updated to reflect new functionality or
      improvements.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Pricing info placeholder or simple info card"
      />
      <figcaption className={styles.imageCaption}>
        Pricing information placeholder.
      </figcaption>
    </figure>

    <h3>Future payment options</h3>
    <p>
      Web2Wireframe may introduce additional payment options in the future to
      better support different regions and user needs. These options could
      include new billing cycles, alternative payment methods, or expanded plan
      types.
    </p>
    <p>
      Any new payment options will be communicated clearly before becoming
      active, and documentation will be updated accordingly.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Future payment options placeholder"
      />
      <figcaption className={styles.imageCaption}>
        Future payment options placeholder.
      </figcaption>
    </figure>

    <h3>Changes to plans and conditions</h3>
    <p>
      Plans, features, and conditions may change over time as Web2Wireframe
      continues to develop. When changes occur, they are intended to improve
      the overall experience and align pricing with feature value.
    </p>
    <p>
      Users will be informed about significant changes in advance whenever
      possible. Updated information will always be reflected in the
      documentation.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Plan update or notification placeholder"
      />
      <figcaption className={styles.imageCaption}>
        Plan update or notification placeholder.
      </figcaption>
    </figure>

    <h3>Renewal and account-related topics</h3>
    <p>
      Pro is a one-time purchase, so there is no recurring subscription to
      cancel and no automatic charges. Access lasts 30 days from the date of
      purchase, and you can review your current plan and expiry date at any
      time in the plugin's Plan modal.
    </p>
    <p>
      To keep Pro past the 30 days, you make another one-time purchase. When
      the period ends without a renewal, the account simply returns to the
      Free tier. We email a reminder before access is due to expire so a
      renewal is never a surprise.
    </p>
    <figure className={styles.imageBlock}>
      <div
        className={styles.imagePlaceholder}
        role="img"
        aria-label="Plan status and renewal placeholder"
      />
      <figcaption className={styles.imageCaption}>
        Plan status and renewal placeholder.
      </figcaption>
    </figure>

    <h3>Final note</h3>
    <p>
      This section provides general guidance and is intended to support
      understanding rather than replace detailed billing flows or policies. As
      payment systems become fully active, this information may be expanded
      with more specific details.
    </p>
  </DocsLayout>
);

export default PricingAdditional;
