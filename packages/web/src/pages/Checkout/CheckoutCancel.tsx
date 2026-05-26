import type { ReactElement } from "react";
import styles from "./Checkout.module.scss";

const CheckoutCancel = (): ReactElement => (
  <div className={styles.page}>
    <div className="container">
      <div className={styles.card}>
        <div className={styles.icon}>↩</div>
        <h1>Checkout canceled</h1>
        <p>
          No charge was made. You can return to the Figma plugin and try
          again whenever you're ready.
        </p>
        {/*
          window.close() is blocked by browsers unless the tab was opened
          by script — Flitt redirects here, so it never works (same issue
          as CheckoutSuccess). A direct link to figma.com works in every
          context: the real flow (Flitt-redirected tab) AND manual visits.
        */}
        <a
          href="https://www.figma.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-primary"
        >
          Open Figma
        </a>
      </div>
    </div>
  </div>
);

export default CheckoutCancel;
