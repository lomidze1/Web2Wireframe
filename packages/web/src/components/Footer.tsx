import { useState, type ReactElement } from "react";
import { Link } from "react-router-dom";
import { installLinks } from "../data/links";
import styles from "./Footer.module.scss";

// Mirrors the browser extension's email check — blocks the Subscribe button on
// inputs like "lomidzeanna33" that lack an @ and a TLD.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type SubscribeStatus = "idle" | "loading" | "success" | "error";

const Footer = (): ReactElement => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SubscribeStatus>("idle");
  const isValidEmail = EMAIL_RE.test(email.trim());

  const handleSubscribe = async (
    e: React.FormEvent<HTMLFormElement>,
  ): Promise<void> => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!isValidEmail) return;

    setStatus("loading");
    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (response.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
    setTimeout(() => setStatus("idle"), 3000);
  };

  return (
    <footer className={styles.footer}>
      <div className={`container ${styles.newsletterRow}`}>
        <span className={styles.newsletterLabel}>
          Occasional notes on new import options. No noise.
        </span>
        <form className={styles.newsletterForm} onSubmit={handleSubscribe}>
          <label className={styles.srOnly} htmlFor="footer-newsletter-email">
            Email
          </label>
          <input
            id="footer-newsletter-email"
            className={styles.newsletterInput}
            type="email"
            placeholder="you@studio.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="submit"
            className="btn btn-secondary"
            disabled={status === "loading" || !isValidEmail}
          >
            {status === "loading" ? "Subscribing…" : "Subscribe"}
          </button>
        </form>
        <span className={styles.newsletterStatus} role="status">
          {status === "success" && "Subscribed — thank you."}
          {status === "error" && "Something went wrong. Try again."}
        </span>
      </div>
      <div className={`container ${styles.inner}`}>
        <Link to="/" className={styles.brand}>
          Web2Wireframe
        </Link>
        <a
          className={styles.link}
          href={installLinks.figmaCommunity}
          target="_blank"
          rel="noreferrer"
        >
          Figma Community
        </a>
        <a
          className={styles.link}
          href={installLinks.chrome}
          target="_blank"
          rel="noreferrer"
        >
          Browser extension
        </a>
        <Link className={styles.link} to="/docs">
          Docs
        </Link>
        <Link className={styles.link} to="/support">
          Support
        </Link>
        <Link className={styles.link} to="/terms">
          Terms
        </Link>
        <Link className={styles.link} to="/privacy">
          Privacy
        </Link>
        <span className={styles.copyright}>
          © {new Date().getFullYear()}
        </span>
      </div>
    </footer>
  );
};

export default Footer;
