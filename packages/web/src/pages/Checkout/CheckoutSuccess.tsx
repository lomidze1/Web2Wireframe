import type { ReactElement } from "react";
import styles from "./Checkout.module.scss";

const CheckoutSuccess = (): ReactElement => (
  <div className={styles.page}>
    <div className="container">
      <div className={styles.card}>
        <div className={styles.icon}>✓</div>
        <h1>Payment successful</h1>
        <p>
          Welcome to Web2Wireframe Pro. Return to the Figma plugin — your
          plan should refresh within a few seconds. If it doesn't, reopen
          the Plan modal in the plugin footer.
        </p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => window.close()}
        >
          Close this tab
        </button>
        <p className={styles.subtle}>
          Need help? Email{" "}
          <a href="mailto:billing@web2wireframe.design">
            billing@web2wireframe.design
          </a>
          .
        </p>
      </div>
    </div>
  </div>
);

export default CheckoutSuccess;
