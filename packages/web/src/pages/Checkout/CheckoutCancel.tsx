import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import styles from "./Checkout.module.scss";

const CheckoutCancel = (): ReactElement => (
  <div className={`container ${styles.page}`}>
    <div className={styles.head}>
      <div className={styles.kicker}>Checkout canceled</div>
      <h1 className={styles.title}>No charge was made.</h1>
      <p className={styles.lead}>
        Your plan is unchanged. Come back whenever you're ready — the price
        and the options will be exactly where you left them.
      </p>
    </div>
    <div className={styles.actions}>
      <Link className="btn btn-primary" to="/checkout">
        Back to checkout
      </Link>
      <Link className="btn btn-secondary" to="/pricing">
        Compare plans
      </Link>
    </div>
  </div>
);

export default CheckoutCancel;
