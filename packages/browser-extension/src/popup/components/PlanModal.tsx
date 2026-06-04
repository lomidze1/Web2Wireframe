/**
 * "Your Plan" modal — real license display (Phase 3 rewrite).
 *
 * Mirrors the Figma plugin's canonical Plan.tsx
 * (packages/figma-plugin/src/ui/components/modalPopup/planPopup/Plan.tsx)
 * with the same five render branches: unpaired / loading / error-network /
 * error-auth / loaded (free + pro variants). Polling logic for post-checkout
 * license refresh is ported verbatim from Plan.tsx:145-189.
 */

import { useEffect, useRef, useState } from "preact/hooks";
import { CloseIcon, SpinnerIcon } from "./Icons";
import {
  AuthExpiredError,
  connectFigma,
  createCheckout,
  fetchMyLicense,
} from "../../shared/licenseClient";
import { clearSession, getSession } from "../../shared/session";
import type { CheckoutPlan, License } from "../../shared/types";
import { inDaysPhrase, limitText, planLabel } from "./planHelpers";

interface PlanModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * `unpaired` no longer means "show a pair-via-plugin notice". Phase 4
 * shows the full Plan layout in this state (FREE badge + placeholder
 * zeros + upgrade cards); clicking Get Pro triggers connectFigma() →
 * createCheckout() automatically, so the user never has to leave the
 * popup just to authenticate.
 */
type ModalState =
  | { kind: "unpaired" }
  | { kind: "loading" }
  | { kind: "error"; message: string; isAuthError: boolean }
  | { kind: "loaded"; license: License };

const POLL_INTERVAL_MS = 5_000;
const POLL_DURATION_MS = 5 * 60 * 1000;

export function PlanModal({ isOpen, onClose }: PlanModalProps) {
  const [state, setState] = useState<ModalState>({ kind: "loading" });
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [isCheckoutPending, setIsCheckoutPending] = useState(false);

  // Refs survive re-renders without invalidating the polling timer.
  const pollTimerRef = useRef<number | null>(null);
  const pollStartRef = useRef<number | null>(null);
  // Snapshot taken before checkout opens — lets the polling loop
  // distinguish first-time upgrade (free → pro) from a renewal (pro,
  // cycleEndsAt moves forward). Verbatim from plugin Plan.tsx:79-83.
  const preCheckoutRef = useRef<{ plan: string; cycleEndsAt: string } | null>(
    null,
  );

  // ------------------------------------------------------------------
  // Load license on open. Cached snapshot renders immediately; the
  // network refresh paints over it once it returns. On 401 we treat
  // the session as gone.
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    (async () => {
      const session = await getSession();
      if (cancelled) return;
      if (!session) {
        setState({ kind: "unpaired" });
        return;
      }
      // Show the cached license immediately so the modal opens instantly
      // even on slow networks. The refresh below overwrites if needed.
      if (session.cachedLicense) {
        setState({ kind: "loaded", license: session.cachedLicense });
      } else {
        setState({ kind: "loading" });
      }

      try {
        const fresh = await fetchMyLicense();
        if (cancelled) return;
        setState({ kind: "loaded", license: fresh });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof AuthExpiredError) {
          setState({
            kind: "error",
            isAuthError: true,
            message: "Your session expired. Reconnect via the Figma plugin.",
          });
        } else {
          setState({
            kind: "error",
            isAuthError: false,
            message:
              err instanceof Error
                ? err.message
                : "Couldn't load your plan. Try again.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Cleanup polling on unmount or close.
  useEffect(() => {
    if (!isOpen) {
      stopPolling();
      setCheckoutMessage(null);
      setIsCheckoutPending(false);
    }
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  function stopPolling(): void {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    pollStartRef.current = null;
  }

  function startPolling(): void {
    stopPolling();
    pollStartRef.current = Date.now();
    pollTimerRef.current = window.setInterval(async () => {
      const elapsed = Date.now() - (pollStartRef.current ?? Date.now());
      if (elapsed > POLL_DURATION_MS) {
        stopPolling();
        setIsCheckoutPending(false);
        setCheckoutMessage(
          "We didn't detect a payment yet. Reopen this modal once it's done.",
        );
        return;
      }
      try {
        const fresh = await fetchMyLicense();
        const pre = preCheckoutRef.current;
        const upgraded = fresh.plan === "pro" && pre?.plan !== "pro";
        const renewed =
          fresh.plan === "pro" &&
          pre?.plan === "pro" &&
          new Date(fresh.cycleEndsAt).getTime() >
            new Date(pre.cycleEndsAt).getTime();
        if (upgraded || renewed) {
          stopPolling();
          setState({ kind: "loaded", license: fresh });
          setIsCheckoutPending(false);
          setCheckoutMessage(
            renewed ? "🎉 Pro extended — thanks!" : "🎉 Welcome to Pro!",
          );
        }
      } catch {
        // Silent — keep polling. The user-visible state stays the same.
      }
    }, POLL_INTERVAL_MS);
  }

  async function handleGetPro(plan: CheckoutPlan): Promise<void> {
    if (isCheckoutPending) return;
    setIsCheckoutPending(true);

    // Snapshot before the URL opens so the polling diff is meaningful.
    if (state.kind === "loaded") {
      preCheckoutRef.current = {
        plan: state.license.plan,
        cycleEndsAt: state.license.cycleEndsAt,
      };
    }

    try {
      // Phase 4: when unpaired, run the one-click Figma OAuth handoff
      // first. Once connectFigma resolves, the session is persisted and
      // fetchMyLicense has filled cachedLicense — we flip the modal to
      // "loaded" so the polling diff has a real pre-state.
      if (state.kind === "unpaired") {
        setCheckoutMessage("Sign in with Figma to continue…");
        const fresh = await connectFigma();
        preCheckoutRef.current = {
          plan: fresh.plan,
          cycleEndsAt: fresh.cycleEndsAt,
        };
        setState({ kind: "loaded", license: fresh });
      }

      setCheckoutMessage("Opening secure checkout…");
      const { checkoutUrl } = await createCheckout(plan);
      chrome.tabs.create({ url: checkoutUrl, active: true });
      setCheckoutMessage(
        "Complete payment in your browser. We'll detect it automatically.",
      );
      startPolling();
    } catch (err) {
      setIsCheckoutPending(false);
      if (err instanceof AuthExpiredError) {
        setState({
          kind: "error",
          isAuthError: true,
          message: "Your session expired. Reconnect via the Figma plugin.",
        });
        return;
      }
      setCheckoutMessage(null);
      setState({
        kind: "error",
        isAuthError: false,
        message:
          err instanceof Error ? err.message : "Couldn't open checkout. Try again.",
      });
    }
  }

  async function handleReconnect(): Promise<void> {
    await clearSession();
    setState({ kind: "unpaired" });
  }

  if (!isOpen) return null;

  const handleOverlayClick = (e: Event) => {
    if ((e.target as HTMLElement).classList.contains("modal-overlay")) {
      onClose();
    }
  };

  return (
    <div class="modal-overlay" onClick={handleOverlayClick}>
      <div class="modal modal-plan">
        <div class="modal-header">
          <h2>Your Plan</h2>
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
          {state.kind === "unpaired" && (
            <UnpairedView
              isCheckoutPending={isCheckoutPending}
              checkoutMessage={checkoutMessage}
              onGetPro={handleGetPro}
            />
          )}
          {state.kind === "loading" && <LoadingView />}
          {state.kind === "error" && (
            <ErrorView
              message={state.message}
              isAuthError={state.isAuthError}
              onReconnect={handleReconnect}
            />
          )}
          {state.kind === "loaded" && (
            <LoadedView
              license={state.license}
              isCheckoutPending={isCheckoutPending}
              checkoutMessage={checkoutMessage}
              onGetPro={handleGetPro}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// State branches
// ============================================================================

/**
 * Anonymous-state render — same layout as the paired FREE state, except
 * Status/Usage rows show placeholder zeros and the Cycle / Account ID
 * rows are hidden (no real values to display). Clicking Get Pro kicks
 * off the OAuth handoff via the parent's handleGetPro.
 */
function UnpairedView({
  isCheckoutPending,
  checkoutMessage,
  onGetPro,
}: {
  isCheckoutPending: boolean;
  checkoutMessage: string | null;
  onGetPro: (plan: CheckoutPlan) => void;
}) {
  return (
    <>
      <div class="plan-summary">
        <span class="plan-label">Current plan</span>
        <span class="plan-badge plan-badge-free">FREE</span>
      </div>

      <div class="plan-meta">
        <div class="plan-meta-row">
          <span>Status</span>
          <span class="plan-meta-value">Active</span>
        </div>
        <div class="plan-meta-row">
          <span>Usage</span>
          <span class="plan-meta-value">0/10 imports this month</span>
        </div>
      </div>

      {checkoutMessage && (
        <div class="plan-notice" role="status" aria-live="polite">
          {checkoutMessage}
        </div>
      )}

      <div class="plan-section-title">
        <span class="plan-section-line" />
        <span>Upgrade your plan</span>
        <span class="plan-section-line" />
      </div>
      <div class="plan-cards">
        <div class="plan-card">
          <div class="plan-card-header">Monthly · $16</div>
          <p class="plan-card-subhead">Pro for 30 days</p>
          <ul class="plan-list">
            <li class="plan-list-item">Unlimited imports</li>
            <li class="plan-list-item">All viewports</li>
            <li class="plan-list-item">Styles & assets</li>
          </ul>
          <button
            class="plan-card-btn"
            type="button"
            disabled={isCheckoutPending}
            onClick={() => onGetPro("monthly")}
          >
            {isCheckoutPending ? "Waiting…" : "Get Pro"}
          </button>
        </div>
        <div class="plan-card plan-card-pro">
          <span class="plan-savings-badge">Save 25%</span>
          <div class="plan-card-header">Yearly · $144</div>
          <p class="plan-card-subhead">Pro for 365 days · just $12/mo</p>
          <ul class="plan-list">
            <li class="plan-list-item">Everything in Monthly</li>
            <li class="plan-list-item">Priority email support</li>
            <li class="plan-list-item">Lock in 2026 pricing</li>
          </ul>
          <button
            class="plan-card-btn plan-card-btn-pro"
            type="button"
            disabled={isCheckoutPending}
            onClick={() => onGetPro("yearly")}
          >
            {isCheckoutPending ? "Waiting…" : "Get Pro"}
          </button>
        </div>
      </div>
    </>
  );
}

function LoadingView() {
  return (
    <div class="plan-notice" role="status" aria-live="polite">
      <SpinnerIcon />
      <span>Loading your plan…</span>
    </div>
  );
}

function ErrorView({
  message,
  isAuthError,
  onReconnect,
}: {
  message: string;
  isAuthError: boolean;
  onReconnect: () => void;
}) {
  return (
    <>
      <div class="plan-error" role="alert">
        {message}
      </div>
      {isAuthError && (
        <button
          class="btn btn-primary btn-upgrade"
          type="button"
          onClick={onReconnect}
        >
          Reconnect
        </button>
      )}
    </>
  );
}

function LoadedView({
  license,
  isCheckoutPending,
  checkoutMessage,
  onGetPro,
}: {
  license: License;
  isCheckoutPending: boolean;
  checkoutMessage: string | null;
  onGetPro: (plan: CheckoutPlan) => void;
}) {
  const isPro = license.plan === "pro";
  const statusLabel =
    license.status[0].toUpperCase() + license.status.slice(1);
  const tier = license.subscription?.lastDuration;

  return (
    <>
      <div class="plan-summary">
        <span class="plan-label">Current plan</span>
        <span class={`plan-badge ${isPro ? "plan-badge-pro" : "plan-badge-free"}`}>
          {planLabel(license)}
        </span>
      </div>

      <div class="plan-meta">
        {isPro && (
          <div class="plan-meta-row">
            <span>Status</span>
            <span class="plan-meta-value">{statusLabel}</span>
          </div>
        )}
        {isPro && license.email && (
          <div class="plan-meta-row">
            <span>Billing email</span>
            <span class="plan-meta-value">{license.email}</span>
          </div>
        )}
        <div class="plan-meta-row">
          <span>Usage</span>
          <span class="plan-meta-value">{limitText(license)}</span>
        </div>
        <div class="plan-meta-row">
          <span>{isPro ? "Access expires" : "Cycle resets"}</span>
          <span class="plan-meta-value">{inDaysPhrase(license.cycleEndsAt)}</span>
        </div>
      </div>

      {checkoutMessage && (
        <div class="plan-notice" role="status" aria-live="polite">
          {checkoutMessage}
        </div>
      )}

      {!isPro && (
        <>
          <div class="plan-section-title">
            <span class="plan-section-line" />
            <span>Upgrade your plan</span>
            <span class="plan-section-line" />
          </div>
          <div class="plan-cards">
            <div class="plan-card">
              <div class="plan-card-header">Monthly · $16</div>
              <p class="plan-card-subhead">Pro for 30 days</p>
              <ul class="plan-list">
                <li class="plan-list-item">Unlimited imports</li>
                <li class="plan-list-item">All viewports</li>
                <li class="plan-list-item">Styles & assets</li>
              </ul>
              <button
                class="plan-card-btn"
                type="button"
                disabled={isCheckoutPending}
                onClick={() => onGetPro("monthly")}
              >
                {isCheckoutPending ? "Waiting…" : "Get Pro"}
              </button>
            </div>
            <div class="plan-card plan-card-pro">
              <span class="plan-savings-badge">Save 25%</span>
              <div class="plan-card-header">Yearly · $144</div>
              <p class="plan-card-subhead">Pro for 365 days · just $12/mo</p>
              <ul class="plan-list">
                <li class="plan-list-item">Everything in Monthly</li>
                <li class="plan-list-item">Priority email support</li>
                <li class="plan-list-item">Lock in 2026 pricing</li>
              </ul>
              <button
                class="plan-card-btn plan-card-btn-pro"
                type="button"
                disabled={isCheckoutPending}
                onClick={() => onGetPro("yearly")}
              >
                {isCheckoutPending ? "Waiting…" : "Get Pro"}
              </button>
            </div>
          </div>
        </>
      )}

      {isPro && tier === "monthly" && (
        <button
          class="plan-cta-link"
          type="button"
          disabled={isCheckoutPending}
          onClick={() => onGetPro("yearly")}
        >
          {isCheckoutPending
            ? "Waiting…"
            : "Upgrade to Yearly — Save 25% ($144 / 365 days)"}
        </button>
      )}
      {isPro && tier === "yearly" && (
        <button
          class="plan-cta-link"
          type="button"
          disabled={isCheckoutPending}
          onClick={() => onGetPro("yearly")}
        >
          {isCheckoutPending ? "Waiting…" : "Extend Pro — +365 days for $144"}
        </button>
      )}
    </>
  );
}
