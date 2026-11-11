import { HelpIcon, LogoutIcon, SignInIcon } from "./Icons";
import type { SessionState } from "../../shared/types";

interface FooterProps {
  onHelpClick: () => void;
  /** Drives the leftmost identity icon: SignInIcon when null, LogoutIcon
   *  when present. Also feeds the title tooltip's "Sign out (email)". */
  session: SessionState | null;
  /** Click handler for the identity icon — App.tsx decides whether to
   *  start the OAuth flow or to confirm-then-logout. */
  onIdentityClick: () => void;
}

/**
 * Popup footer: identity action (Sign in with Figma OR Sign out) on the left,
 * Help on the right (Contact us lives inside Help). Web2Wireframe is free, so
 * there is no usage pill or plan entry point.
 */
export function Footer({
  onHelpClick,
  session,
  onIdentityClick,
}: FooterProps) {
  const isSignedIn = session !== null;
  const identityTitle = isSignedIn
    ? `Sign out${session?.email ? ` (${session.email})` : ""}`
    : "Sign in with Figma";

  return (
    <footer class="popup-footer">
      <button
        class="footer-btn"
        onClick={onIdentityClick}
        type="button"
        aria-label={isSignedIn ? "Sign out" : "Sign in with Figma"}
        title={identityTitle}
      >
        {isSignedIn ? <LogoutIcon /> : <SignInIcon />}
      </button>
      <button
        class="footer-btn"
        onClick={onHelpClick}
        type="button"
        aria-label="Help"
        title="Help"
      >
        <HelpIcon />
      </button>
    </footer>
  );
}
