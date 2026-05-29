import { useRef, useState, type ReactElement } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useModalA11y } from "../hooks/useModalA11y";
import styles from "./MyUserModal.module.scss";

interface MyUserModalProps {
  open: boolean;
  onClose: () => void;
}

type SubscribeStatus = "idle" | "loading" | "success" | "error";

/**
 * "My User" modal — mirrors the browser extension's IdentityModal UX.
 *
 * Logged-out: "Log in with Figma" + newsletter form.
 * Logged-in:  Figma User ID + email + subscription status + Logout +
 *             newsletter form (kept visible per product decision — even
 *             logged-in users may want to subscribe).
 */
const MyUserModal = ({ open, onClose }: MyUserModalProps): ReactElement | null => {
  const { user, login, logout } = useAuth();
  const [email, setEmail] = useState("");
  const [subscribeStatus, setSubscribeStatus] = useState<SubscribeStatus>("idle");
  const [copyState, setCopyState] = useState<"id" | "email" | null>(null);
  // P5-A11Y-3: dialog container ref for the focus-trap hook.
  const dialogRef = useRef<HTMLDivElement>(null);
  useModalA11y(open, onClose, dialogRef);

  if (!open) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleLogin = () => {
    login();
  };

  const handleLogout = async () => {
    if (!window.confirm("Sign out of Web2Wireframe?")) return;
    await logout();
    onClose();
  };

  const handleSubscribe = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) return;

    setSubscribeStatus("loading");
    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      if (response.ok) {
        setSubscribeStatus("success");
        setEmail("");
      } else {
        setSubscribeStatus("error");
      }
    } catch {
      setSubscribeStatus("error");
    }
    setTimeout(() => setSubscribeStatus("idle"), 3000);
  };

  const copy = async (value: string, which: "id" | "email") => {
    try {
      await navigator.clipboard.writeText(value);
      setCopyState(which);
      setTimeout(() => setCopyState(null), 1500);
    } catch {
      // Clipboard API may fail without document focus — silent.
    }
  };

  // Pro status string — "Pro until <date>" / "Free" / "Canceled (Pro until …)"
  const planLabel = (() => {
    if (!user) return null;
    if (user.plan === "pro") {
      const until = user.cycleEndsAt
        ? new Date(user.cycleEndsAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
          })
        : null;
      return user.status === "canceled"
        ? `Canceled${until ? ` — access until ${until}` : ""}`
        : `Pro${until ? ` — until ${until}` : ""}`;
    }
    return "Free";
  })();

  return (
    <div className={styles.overlay} onClick={handleOverlayClick} role="presentation">
      <div
        ref={dialogRef}
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label="Your account"
      >
        <div className={styles.header}>
          <h2>Your account</h2>
          <button
            type="button"
            className={styles.close}
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className={styles.content}>
          {user ? (
            <div className={styles.section}>
              <div className={styles.field}>
                <span className={styles.label}>User ID</span>
                <div className={styles.row}>
                  <span className={styles.value}>{user.figmaUserId}</span>
                  <button
                    type="button"
                    className={`${styles.copyBtn} ${copyState === "id" ? styles.copied : ""}`}
                    aria-label="Copy user ID"
                    onClick={() => copy(user.figmaUserId, "id")}
                  >
                    {copyState === "id" ? "Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div className={styles.field}>
                <span className={styles.label}>Email</span>
                <div className={styles.row}>
                  <span className={styles.value}>{user.email ?? "—"}</span>
                  {user.email && (
                    <button
                      type="button"
                      className={`${styles.copyBtn} ${copyState === "email" ? styles.copied : ""}`}
                      aria-label="Copy email"
                      onClick={() => copy(user.email ?? "", "email")}
                    >
                      {copyState === "email" ? "Copied" : "Copy"}
                    </button>
                  )}
                </div>
              </div>

              <div className={styles.field}>
                <span className={styles.label}>Plan</span>
                <div className={styles.row}>
                  <span className={styles.value}>{planLabel}</span>
                </div>
              </div>

              <div className={styles.field}>
                <span className={styles.label}>Usage</span>
                <div className={styles.row}>
                  <span className={styles.value}>
                    {user.usage.limit === null
                      ? "Unlimited"
                      : `${user.usage.imports}/${user.usage.limit} imports this month`}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleLogout}
              >
                Log out
              </button>
            </div>
          ) : (
            <div className={styles.section}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleLogin}
              >
                Log in with Figma
              </button>
            </div>
          )}

          <div className={styles.divider} />

          <div className={styles.section}>
            <h3>Subscribe to news</h3>
            <form className={styles.newsletterForm} onSubmit={handleSubscribe}>
              <input
                type="email"
                className={styles.input}
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={subscribeStatus === "loading"}
                required
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={subscribeStatus === "loading" || !email}
              >
                {subscribeStatus === "loading" ? "…" : "Subscribe"}
              </button>
            </form>
            {subscribeStatus === "success" && (
              <p className={styles.success}>Thanks for subscribing!</p>
            )}
            {subscribeStatus === "error" && (
              <p className={styles.error}>Subscription failed. Please try again.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyUserModal;
