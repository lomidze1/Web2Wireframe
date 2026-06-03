/**
 * IdentityModal — owns login / logout / user-info / newsletter UX.
 *
 * Replaces the Phase 5.1 pattern of "click the footer icon → direct
 * connectFigma()". That pattern broke because the popup closes the
 * moment the OAuth tab takes focus, killing the polling loop. Now the
 * popup just dispatches a `START_FIGMA_OAUTH` message and the
 * background service worker handles the 3-minute poll on its own (see
 * background/index.ts).
 *
 * Render branches:
 *   - logged out → Log in button + horizontal divider + Subscribe form
 *   - logged in  → User ID + Email (each with copy button) + Log out
 *                  + horizontal divider + Subscribe form
 *
 * The Subscribe form moved verbatim from HelpModal (same fetch shape,
 * same backendUrl resolution); HelpModal is now a thin links list.
 */

import { useEffect, useState } from "preact/hooks";
import { CloseIcon, CopyIcon, MailIcon } from "./Icons";
import { fetchMyLicense, revokeSession } from "../../shared/licenseClient";
import { API_URL, STORAGE_KEYS } from "../../shared/constants";
import type { SessionState } from "../../shared/types";

// Same shape used by ReportIssue's email check — keeps the Subscribe button
// from firing on inputs like "lomidzeanna33" that lack an @ and a TLD.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface IdentityModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: SessionState | null;
}

type CopyStatus = "idle" | "copied";
type SubscribeStatus = "idle" | "loading" | "success" | "error";
type LoginStatus = "idle" | "pending" | "error";

export function IdentityModal({ isOpen, onClose, session }: IdentityModalProps) {
  const [copyId, setCopyId] = useState<CopyStatus>("idle");
  const [copyEmail, setCopyEmail] = useState<CopyStatus>("idle");
  const [email, setEmail] = useState("");
  const [subscribeStatus, setSubscribeStatus] = useState<SubscribeStatus>("idle");
  const [loginStatus, setLoginStatus] = useState<LoginStatus>("idle");
  const [loginError, setLoginError] = useState<string | null>(null);

  // Refresh the license snapshot whenever the modal opens while signed in, so
  // the Email line reflects the latest server state — e.g. an email persisted
  // on the license doc after this session was first created. fetchMyLicense
  // writes the fresh snapshot to storage; App.tsx's storage listener flows it
  // back down as a new `session` prop. Errors are swallowed: a stale email is
  // better than a surfaced network error in this passive modal.
  useEffect(() => {
    if (!isOpen || session === null) return;
    void fetchMyLicense().catch(() => {
      // Passive refresh — keep the cached snapshot rather than surface errors.
    });
  }, [isOpen, session?.figmaUserId]);

  if (!isOpen) return null;

  const isValidEmail = EMAIL_RE.test(email.trim());

  const handleOverlayClick = (e: Event) => {
    if ((e.target as HTMLElement).classList.contains("modal-overlay")) {
      onClose();
    }
  };

  // ------------------------------------------------------------------
  // Log in — fires the background OAuth flow.
  //
  // The popup will close itself the moment the OAuth tab takes focus;
  // the background service worker handles the 3-minute polling and
  // persists the session via chrome.storage.local. If the background
  // returns an error (no listener, already in flight) we surface it
  // inline instead of silently closing the modal — that "silent close"
  // was the user-reported "nothing happens" symptom.
  // ------------------------------------------------------------------
  const handleLogin = async () => {
    setLoginStatus("pending");
    setLoginError(null);
    try {
      const response = (await chrome.runtime.sendMessage({
        type: "START_FIGMA_OAUTH",
      })) as { success?: boolean; reason?: string } | undefined;
      if (response && response.success === false) {
        setLoginStatus("error");
        setLoginError(
          response.reason === "in_flight"
            ? "A sign-in is already in progress. Check your open tabs."
            : "Couldn't start sign-in. Try reloading the extension.",
        );
        return;
      }
      // Success: the OAuth tab is opening. Close the modal so the
      // user sees the page underneath; the popup itself will close
      // when the OAuth tab takes focus.
      onClose();
    } catch (err) {
      // chrome.runtime.sendMessage rejects when no service-worker
      // listener answers — typically because the extension wasn't
      // reloaded after a code change.
      setLoginStatus("error");
      setLoginError(
        err instanceof Error
          ? `Background unreachable: ${err.message}. Try reloading the extension at chrome://extensions.`
          : "Background unreachable. Try reloading the extension.",
      );
    }
  };

  // ------------------------------------------------------------------
  // Log out — confirm + revoke. App.tsx's storage listener flips the
  // session prop to null, so on next open this modal renders the
  // logged-out branch automatically.
  // ------------------------------------------------------------------
  const handleLogout = async () => {
    if (!window.confirm("Sign out of Web2Wireframe?")) return;
    await revokeSession();
    onClose();
  };

  const copy = async (text: string, setStatus: (s: CopyStatus) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      // Clipboard API can fail when document isn't focused — extension
      // popups occasionally drop focus mid-click. Silent: the user can
      // retry; no toast surface to fall back to.
    }
  };

  // ------------------------------------------------------------------
  // Newsletter subscribe — copied verbatim from HelpModal so the
  // network call shape stays identical. backendUrl resolution honors
  // the Options-page override, falling back to the prod constant.
  // ------------------------------------------------------------------
  const handleSubscribe = async (e: Event) => {
    e.preventDefault();
    if (!isValidEmail) return;

    setSubscribeStatus("loading");

    let backendUrl = API_URL;
    try {
      const stored = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
      const settings = stored[STORAGE_KEYS.SETTINGS] as
        | { backendUrl?: string }
        | undefined;
      if (settings?.backendUrl) backendUrl = settings.backendUrl;
    } catch {
      // fall through with the prod default
    }

    try {
      const response = await fetch(`${backendUrl}/api/newsletter/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        setSubscribeStatus("success");
        setEmail("");
        setTimeout(() => setSubscribeStatus("idle"), 3000);
      } else {
        setSubscribeStatus("error");
        setTimeout(() => setSubscribeStatus("idle"), 3000);
      }
    } catch {
      setSubscribeStatus("error");
      setTimeout(() => setSubscribeStatus("idle"), 3000);
    }
  };

  const isLoggedIn = session !== null;
  // Prefer the freshest email from the cached license snapshot — `session.email`
  // is a one-time copy taken at connect/redeem time and goes stale if the email
  // landed on the license doc only after the session was created (OAuth race).
  const sessionEmail = session?.cachedLicense?.email ?? session?.email ?? null;

  return (
    <div class="modal-overlay" onClick={handleOverlayClick}>
      <div class="modal">
        <div class="modal-header">
          <h2>Your account</h2>
          <button
            class="modal-close"
            onClick={onClose}
            type="button"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        <div class="modal-content">
          {isLoggedIn ? (
            <div class="identity-section">
              <div>
                <span class="identity-label">User ID</span>
                <div class="identity-row">
                  <span class="identity-value">{session.figmaUserId}</span>
                  <button
                    class={`copy-btn ${copyId === "copied" ? "copied" : ""}`}
                    type="button"
                    aria-label="Copy user ID"
                    title="Copy user ID"
                    onClick={() => copy(session.figmaUserId, setCopyId)}
                  >
                    <CopyIcon />
                  </button>
                </div>
              </div>

              <div>
                <span class="identity-label">Email</span>
                <div class="identity-row">
                  <span class="identity-value">
                    {sessionEmail ?? "—"}
                  </span>
                  {sessionEmail && (
                    <button
                      class={`copy-btn ${copyEmail === "copied" ? "copied" : ""}`}
                      type="button"
                      aria-label="Copy email"
                      title="Copy email"
                      onClick={() => copy(sessionEmail, setCopyEmail)}
                    >
                      <CopyIcon />
                    </button>
                  )}
                </div>
              </div>

              <button
                class="btn btn-secondary btn-block"
                type="button"
                onClick={handleLogout}
              >
                Log out
              </button>
            </div>
          ) : (
            <div class="identity-section">
              <button
                class="btn btn-primary btn-block"
                type="button"
                onClick={handleLogin}
                disabled={loginStatus === "pending"}
              >
                {loginStatus === "pending"
                  ? "Opening Figma…"
                  : "Log in with Figma"}
              </button>
              {loginError && (
                <p class="newsletter-error" role="alert">
                  {loginError}
                </p>
              )}
            </div>
          )}

          <div class="divider" />

          {/* Newsletter — same markup classes as HelpModal previously used. */}
          <div class="newsletter-section">
            <h3>Subscribe to news</h3>
            <form class="newsletter-form" onSubmit={handleSubscribe}>
              <div class="newsletter-input-wrapper">
                <span class="newsletter-icon">
                  <MailIcon />
                </span>
                <input
                  type="email"
                  class="newsletter-input"
                  placeholder="Enter your email"
                  value={email}
                  onInput={(e) =>
                    setEmail((e.target as HTMLInputElement).value)
                  }
                  disabled={subscribeStatus === "loading"}
                />
              </div>
              <button
                type="submit"
                class="btn btn-primary newsletter-btn"
                disabled={subscribeStatus === "loading" || !isValidEmail}
              >
                {subscribeStatus === "loading" ? "..." : "Subscribe"}
              </button>
            </form>
            {subscribeStatus === "success" && (
              <p class="newsletter-success">Thanks for subscribing!</p>
            )}
            {subscribeStatus === "error" && (
              <p class="newsletter-error">
                Subscription failed. Please try again.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
