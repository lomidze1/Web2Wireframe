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
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => window.close()}
        >
          Close this tab
        </button>
      </div>
    </div>
  </div>
);

export default CheckoutCancel;
