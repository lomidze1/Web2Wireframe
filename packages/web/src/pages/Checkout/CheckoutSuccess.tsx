import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import styles from "./Checkout.module.scss";

const CheckoutSuccess = (): ReactElement => (
  <div className={styles.page}>
    <div className="container">
      <div className={styles.card}>
        <div className={styles.icon}>✓</div>
        <h1>Payment successful</h1>
        <p>
          Thank you for upgrading to Pro! Return to the Figma plugin — your
          plan refreshes in a few seconds, or just reload it.
        </p>
        {/*
          window.close() is blocked by browsers unless the tab was opened
          by script — Flitt redirects here, so it never works. A homepage
          link is a useful fallback that always works.
        */}
        <Link to="/" className="btn btn-primary">
          Return to homepage
        </Link>
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
