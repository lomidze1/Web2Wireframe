import type { FormEvent, ReactElement } from "react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import styles from "./A11yFix.module.scss";

/**
 * `/go/a11y-fix` — fake door for "Fix all via styles — Pro" in the plugin.
 * The fix doesn't exist yet: this page says so and offers an email sign-up.
 * Visits are counted by Vercel Web Analytics like every /go link; a sign-up
 * lands on its own path so it can be counted separately (the newsletter
 * audience can't tell these emails from footer sign-ups).
 */
export const A11Y_FIX_THANKS_PATH = "/go/a11y-fix/thanks";

// Same check as the footer's newsletter form.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Status = "idle" | "loading" | "error";

const A11yFix = ({ submitted = false }: { submitted?: boolean }): ReactElement => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const isValidEmail = EMAIL_RE.test(email.trim());

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    if (!isValidEmail) return;
    setStatus("loading");
    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      if (response.ok) {
        navigate(A11Y_FIX_THANKS_PATH, { replace: true });
        return;
      }
    } catch {
      /* fall through to the error state */
    }
    setStatus("error");
  };

  return (
    <div className={`container ${styles.page}`}>
      <h1 className={styles.title}>Fix contrast issues via styles</h1>

      {submitted ? (
        <p className={styles.lead} role="status">
          Thanks — we'll email you when it's ready.
        </p>
      ) : (
        <>
          <p className={styles.lead}>
            This feature is still being built. It will fix low-contrast text by
            updating the Paint Styles your wireframe already uses, so every layer
            on that style is fixed at once.
          </p>
          <p className={styles.lead}>
            Leave your email and you'll be the first to know when it's ready.
          </p>

          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.srOnly} htmlFor="a11y-fix-email">
              Email
            </label>
            <input
              id="a11y-fix-email"
              className={styles.input}
              type="email"
              placeholder="you@studio.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={status === "loading" || !isValidEmail}
            >
              {status === "loading" ? "Sending…" : "Notify me"}
            </button>
          </form>
          <p className={styles.note}>
            We'll add you to Web2Wireframe product updates. Unsubscribe anytime.
          </p>
          {status === "error" && (
            <p className={styles.error} role="status">
              Something went wrong. Try again.
            </p>
          )}
        </>
      )}
    </div>
  );
};

export default A11yFix;
