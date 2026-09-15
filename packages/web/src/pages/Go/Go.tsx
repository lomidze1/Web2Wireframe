import type { ReactElement } from "react";
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { REDIRECT_DELAY_MS, resolveGoRedirect } from "./goRedirect";
import styles from "./Go.module.scss";

const Go = (): ReactElement => {
  const { source } = useParams();
  const { target } = resolveGoRedirect(source);

  useEffect(() => {
    // replace(), not assign(): the /go stub stays out of the back-button history.
    const timer = window.setTimeout(
      () => window.location.replace(target),
      REDIRECT_DELAY_MS,
    );
    return () => window.clearTimeout(timer);
  }, [target]);

  return (
    <div className={`container ${styles.page}`}>
      <p className={styles.lead}>Opening Web2Wireframe on Figma Community…</p>
      <a className={styles.link} href={target}>
        Continue to Figma Community
      </a>
    </div>
  );
};

export default Go;
