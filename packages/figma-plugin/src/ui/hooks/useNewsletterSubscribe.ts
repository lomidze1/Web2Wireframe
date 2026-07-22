import { useEffect, useRef, useState } from "preact/hooks";
import { subscribeNewsletter } from "../shared/newsletterClient";

export type SubscribeStatus = "idle" | "loading" | "success" | "error";

/** How long the ✓ Subscribed! / error label lingers before returning to idle. */
const RESET_MS = 3000;

interface UseNewsletterSubscribe {
  status: SubscribeStatus;
  /** True when there's no email to subscribe (button should be disabled). */
  disabled: boolean;
  subscribe: () => void;
}

/**
 * Shared one-click subscribe state machine for the Plan and Help modals.
 *
 * `email` comes from the cached license (`useLicense().license?.email`). When
 * it's null the user connected but their identity email hasn't been backfilled
 * yet — we disable rather than prompt for input. Subscribed state is
 * session-local by design (no persisted flag → no backend change): success and
 * error labels auto-reset after `RESET_MS`, and re-clicks are safe because the
 * endpoint is idempotent.
 */
export function useNewsletterSubscribe(
  email: string | null,
): UseNewsletterSubscribe {
  const [status, setStatus] = useState<SubscribeStatus>("idle");
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    };
  }, []);

  const scheduleReset = () => {
    if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setStatus("idle"), RESET_MS);
  };

  const subscribe = () => {
    if (!email || status === "loading") return;
    setStatus("loading");
    void (async () => {
      try {
        await subscribeNewsletter(email);
        setStatus("success");
      } catch {
        setStatus("error");
      }
      scheduleReset();
    })();
  };

  return { status, disabled: email == null, subscribe };
}
