import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import styles from "./Renew.module.scss";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3002";

/**
 * One-click renewal landing page. Reached from the expiry reminder email
 * (`/renew?uid=<figmaUserId>`). Creates a fresh Flitt checkout on mount and
 * redirects the browser straight to it — no clicks needed.
 */
const Renew = (): ReactElement => {
  const [params] = useSearchParams();
  const uid = params.get("uid");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!uid) return; // handled by the dedicated empty-state below
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/checkout/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ figmaUserId: uid }),
        });
        const data = (await res.json()) as {
          checkoutUrl?: string;
          error?: string;
        };
        if (!res.ok || !data.checkoutUrl) {
          throw new Error(data.error || "Could not start checkout");
        }
        if (!cancelled) window.location.href = data.checkoutUrl;
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Could not start checkout",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  return (
    <div className={styles.page}>
      <div className="container">
        <div className={styles.card}>
          {!uid ? (
            <>
              <div className={styles.iconInfo}>?</div>
              <h1>This renewal link is incomplete</h1>
              <p>
                The link you used is missing your account ID. This usually
                means the URL was truncated when copied from your email.
              </p>
              <p>
                Open the Web2Wireframe plugin in Figma and use the{" "}
                <strong>Renew</strong> button in the Plan modal, or browse{" "}
                <Link to="/pricing">our pricing</Link>.
              </p>
              <p className={styles.subtle}>
                Need help? Email{" "}
                <a href="mailto:billing@web2wireframe.design">
                  billing@web2wireframe.design
                </a>
                .
              </p>
            </>
          ) : error ? (
            <>
              <div className={styles.iconError}>!</div>
              <h1>Renewal couldn't start</h1>
              <p>{error}</p>
              <p className={styles.subtle}>
                Need help? Email{" "}
                <a href="mailto:billing@web2wireframe.design">
                  billing@web2wireframe.design
                </a>
                .
              </p>
            </>
          ) : (
            <>
              <div className={styles.spinner} aria-hidden="true" />
              <h1>Taking you to checkout…</h1>
              <p>
                Hold on — we're opening the secure Flitt checkout to renew
                your Web2Wireframe Pro access ($16 for 30 days).
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Renew;
