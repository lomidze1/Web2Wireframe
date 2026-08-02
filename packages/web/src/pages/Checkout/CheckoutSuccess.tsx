import type { ReactElement } from "react";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { getOrderView } from "../Account/accountLogic";
import { installLinks } from "../../data/links";
import styles from "./Checkout.module.scss";

const nextSteps = [
  {
    n: "01",
    title: "Open More Options",
    body: "Everything you skipped on the free plan is where the time is saved. Set them once; the plugin remembers.",
  },
  {
    n: "02",
    title: "Run all three viewports",
    body: "1440, 768 and 375 in one import, side by side. It counts the same as one.",
  },
  {
    n: "03",
    title: "Save your defaults",
    body: "Hit Save in the settings footer and every future import starts configured.",
  },
];

const CheckoutSuccess = (): ReactElement => {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const plan = params.get("plan");
  const receipt =
    plan === "monthly" || plan === "yearly"
      ? getOrderView(plan === "yearly" ? "annual" : "monthly").receipt
      : "Payment received — Pro is active.";

  // Flitt redirects here after the payment; the webhook that activates the
  // licence can lag by a few seconds. Refresh the session now and once more
  // shortly after, so the header chip flips to PRO without a reload.
  useEffect(() => {
    void refresh();
    const retry = window.setTimeout(() => void refresh(), 5000);
    return () => window.clearTimeout(retry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.head}>
        <div className={styles.kicker}>Payment received</div>
        <h1 className={styles.title}>
          You're on Pro. The import counter is gone.
        </h1>
        <p className={styles.lead}>
          {receipt} The plugin picks this up the next time you open it — no
          re-install, no licence key to paste.
        </p>
      </div>

      <div className={styles.steps}>
        {nextSteps.map((step) => (
          <div key={step.n} className={styles.step}>
            <div className={styles.stepNumeral}>{step.n}</div>
            <h3 className={styles.stepTitle}>{step.title}</h3>
            <p className={styles.stepBody}>{step.body}</p>
          </div>
        ))}
      </div>

      <div className={styles.actions}>
        <a
          className="btn btn-primary"
          href={installLinks.figmaCommunity}
          target="_blank"
          rel="noreferrer"
        >
          Open the plugin
        </a>
        <Link className="btn btn-secondary" to="/account">
          View account
        </Link>
      </div>

      <p className={styles.subtle}>
        Need help? Email{" "}
        <a href="mailto:billing@web2wireframe.design">
          billing@web2wireframe.design
        </a>
        .
      </p>
    </div>
  );
};

export default CheckoutSuccess;
