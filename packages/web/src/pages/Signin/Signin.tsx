import type { ReactElement } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { installLinks } from "../../data/links";
import styles from "./Signin.module.scss";

const points = [
  "Your quota, always current — and how much of it this month has used.",
  "Billing and the plan switch — nothing that interrupts you mid-import.",
  "One account across the plugin and the browser extension.",
];

const Signin = (): ReactElement => {
  const { user, loading, login } = useAuth();
  const location = useLocation();
  const next = (location.state as { next?: string } | null)?.next ?? "/account";

  if (!loading && user) {
    return <Navigate to="/account" replace />;
  }

  return (
    <div className={`container ${styles.page}`}>
      <div className={styles.grid}>
        <div className={styles.left}>
          <div className={styles.kicker}>Account</div>
          <h1 className={styles.title}>Sign in to see your imports.</h1>
          <p className={styles.lead}>
            Same account as the plugin. There is no password — you sign in with
            Figma.
          </p>
          <div className={styles.form}>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => login(next)}
            >
              Sign in with Figma
            </button>
            <p className={styles.note}>
              Signing in doesn't install anything. To import, you also need the{" "}
              <a
                href={installLinks.figmaCommunity}
                target="_blank"
                rel="noreferrer"
              >
                Figma plugin
              </a>
              .
            </p>
          </div>
        </div>
        <div className={styles.right}>
          <p className={styles.aside}>
            The account page is for your plan and your quota — the work happens
            in Figma.
          </p>
          <div className={styles.points}>
            {points.map((point) => (
              <div key={point} className={styles.point}>
                {point}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signin;
