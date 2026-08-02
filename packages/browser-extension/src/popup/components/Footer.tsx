import { HelpIcon, LogoutIcon, SignInIcon } from "./Icons";
import { usagePillText } from "./planHelpers";
import type { License, SessionState } from "../../shared/types";

interface FooterProps {
  onPlanClick: () => void;
  onHelpClick: () => void;
  /** Drives the middle usage pill: "0/10" / "N/10" / "Pro". */
  license: License | null;
  /** Drives the leftmost identity icon: SignInIcon when null, LogoutIcon
   *  when present. Also feeds the title tooltip's "Sign out (email)". */
  session: SessionState | null;
  /** Click handler for the identity icon — App.tsx decides whether to
   *  start the OAuth flow or to confirm-then-logout. */
  onIdentityClick: () => void;
}

/**
 * Three-slot popup footer (Phase 5.1):
 *
 *   ┌──────┬─────────┬──────┐
 *   │ ⇨/⇦ │  0/10   │  ?   │
 *   └──────┴─────────┴──────┘
 *
 * Left = identity action (Sign in with Figma OR Sign out).
 * Middle = usage pill, opens Plan modal. Absent until a license is loaded, so
 *          a signed-out footer is just the two icons at either edge.
 * Right = help, opens Help modal (Contact us lives inside Help).
 */
export function Footer({
  onPlanClick,
  onHelpClick,
  license,
  session,
  onIdentityClick,
}: FooterProps) {
  const isPro = license?.plan === "pro";
  const isSignedIn = session !== null;
  // null until a license is actually loaded — no placeholder count for a
  // surface that can't spend quota. The slot is simply absent.
  const pillText = usagePillText(license);
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
      {pillText !== null && (
        <button
          class={`usage-pill ${isPro ? "usage-pill-pro" : ""}`}
          onClick={onPlanClick}
          type="button"
          aria-label={isPro ? "Pro plan — open Your Plan" : "Imports used — open Your Plan"}
          title={isPro ? "Pro plan" : "Imports used this month"}
        >
          {pillText}
        </button>
      )}
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
