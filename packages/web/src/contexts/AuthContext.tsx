import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import PricingModal from "../components/PricingModal";

export type AuthPlan = "free" | "pro";
export type AuthStatus = "active" | "canceled" | "expired";

export interface AuthUser {
  figmaUserId: string;
  email: string | null;
  plan: AuthPlan;
  status: AuthStatus;
  cycleEndsAt: string | null;
  /**
   * Current cycle import usage. `limit` is null for Pro (unlimited); free
   * users get an integer (10 at launch).
   */
  usage: {
    imports: number;
    limit: number | null;
  };
}

export interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  /** Start the Figma OAuth flow; the browser leaves the page. */
  login: (returnTo?: string) => void;
  /** Clear the session and update local state. */
  logout: () => Promise<void>;
  /** Manually re-poll /web/me (e.g. after a checkout return). */
  refresh: () => Promise<void>;
  /**
   * Open the Monthly/Yearly Pro pricing modal. `initialTier` pre-selects a
   * tier (e.g. the one the user toggled on the Pricing page) so they don't
   * have to re-pick it in the modal.
   */
  openPricing: (initialTier?: "monthly" | "yearly") => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PRICING_RESTORE_KEY = "w2w_pricing_modal_pending";

/**
 * Auth + session calls must hit the API host DIRECTLY in production.
 *
 * The website (Vercel) and API (Render) live on different subdomains, bridged
 * by Vercel rewrites (`/auth`, `/web` → api.web2wireframe.design). But Vercel's
 * external rewrites drop the `Set-Cookie` from the proxied OAuth login response,
 * so the session cookie was never stored and the Figma callback then read an
 * empty session → "Invalid state". Talking straight to api.web2wireframe.design
 * sets the cookie on the api host itself; it is shared across subdomains via
 * `Domain=.web2wireframe.design` (set server-side) and is sent on these
 * same-site, credentialed calls.
 *
 * In dev, "" keeps the relative path so the Vite proxy (vite.config.ts) still
 * routes to localhost:3002, where there are no subdomains to bridge.
 */
const API_BASE = import.meta.env.PROD ? "https://api.web2wireframe.design" : "";

/**
 * Hydrate the in-memory auth state from /web/me. The session cookie is
 * httpOnly; React can't read it, so the only source of truth for "am I
 * logged in" is asking the API. We do this once on mount and again on
 * demand via refresh().
 *
 * P5-SF-2: distinguish three outcomes — `logged-out` (true 401), `error`
 * (network/5xx; we don't know), `user` (fresh data). Previously every
 * non-2xx collapsed to `null` and the UI rendered "Sign in" on any blip,
 * including the post-checkout return when /web/me 503s with `licenseStale`.
 * Errors now surface so callers can retry / show a transient state instead
 * of silently logging out a paying user.
 */
type FetchMeResult =
  | { kind: "user"; user: AuthUser }
  | { kind: "logged-out" }
  | { kind: "error" };

async function fetchMe(): Promise<FetchMeResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/web/me`, { credentials: "include" });
  } catch {
    // Network down — we don't know if the cookie is still valid. Don't
    // downgrade the user to logged-out on a transient blip.
    return { kind: "error" };
  }
  if (response.status === 401) return { kind: "logged-out" };
  // P5-SF-1: 503 with `licenseStale: true` means the server has a valid
  // session but Mongo is unavailable. Treat as "error" so the UI can
  // retry without flipping to logged-out OR silently downgrading Pro→Free.
  if (response.status === 503) return { kind: "error" };
  if (!response.ok) return { kind: "error" };
  const data = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        licenseStale?: boolean;
        figmaUserId?: string;
        email?: string | null;
        plan?: AuthPlan;
        status?: AuthStatus;
        cycleEndsAt?: string | null;
        usage?: { imports?: number; limit?: number | null };
      }
    | null;
  if (!data || data.ok !== true || typeof data.figmaUserId !== "string") {
    return { kind: "logged-out" };
  }
  // Defensive: if the server somehow returned `licenseStale` on a 200, treat
  // it as error too — license fields are unreliable.
  if (data.licenseStale) return { kind: "error" };
  return {
    kind: "user",
    user: {
      figmaUserId: data.figmaUserId,
      email: data.email ?? null,
      plan: data.plan ?? "free",
      status: data.status ?? "active",
      cycleEndsAt: data.cycleEndsAt ?? null,
      usage: {
        imports: data.usage?.imports ?? 0,
        limit: data.usage?.limit ?? (data.plan === "pro" ? null : 10),
      },
    },
  };
}

/** sessionStorage holds a pending Pro purchase across the OAuth redirect. */
function hasPendingPricing(): boolean {
  try {
    const raw = sessionStorage.getItem(PRICING_RESTORE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as { ts?: number } | null;
    if (!parsed || typeof parsed.ts !== "number") return false;
    return Date.now() - parsed.ts < 10 * 60 * 1000;
  } catch {
    return false;
  }
}

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [pricingInitialTier, setPricingInitialTier] = useState<
    "monthly" | "yearly" | undefined
  >(undefined);
  // Guard the post-login auto-open so it only fires once per OAuth round-trip,
  // not on every subsequent /web/me refresh.
  const autoOpenedRef = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    // P5-SF-2: retry once on transient `error` (network/5xx/licenseStale)
    // before settling on an outcome. Common case is a post-checkout return
    // racing the webhook activation — a 1-second delay almost always wins.
    // We DON'T retry on `logged-out` because that's a definitive answer.
    let result = await fetchMe();
    if (result.kind === "error") {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      result = await fetchMe();
    }
    if (result.kind === "user") {
      setUser(result.user);
    } else if (result.kind === "logged-out") {
      setUser(null);
    }
    // On `error` after retry: leave previous `user` value untouched so the
    // UI doesn't silently flip a logged-in Pro user to "Sign in" on an
    // Atlas blip. The user can manually refresh; we'll heal on next poll.
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Auto-reopen the Pro pricing modal once the user lands back from OAuth.
  // The PricingModal itself reads sessionStorage for the saved tier, so we
  // just need to flip the open flag here.
  useEffect(() => {
    if (!user) return;
    if (autoOpenedRef.current) return;
    if (!hasPendingPricing()) return;
    autoOpenedRef.current = true;
    setPricingOpen(true);
  }, [user]);

  const login = useCallback((returnTo?: string) => {
    // Capture the current path so the callback can land the user back where
    // they started (e.g. /pricing). The backend's validator rejects anything
    // that isn't a same-origin path; we still default to "/" defensively.
    const path = returnTo ?? window.location.pathname + window.location.search;
    const safePath = path.startsWith("/") ? path : "/";
    const url = `${API_BASE}/auth/figma/login?return_to=${encodeURIComponent(safePath)}`;
    window.location.href = url;
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/auth/figma/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Even if the network call fails, clear local state — the user
      // intent is "log out". Worst case the cookie outlives the click;
      // they can refresh to retry server-side destruction.
    }
    setUser(null);
  }, []);

  const openPricing = useCallback((initialTier?: "monthly" | "yearly") => {
    setPricingInitialTier(initialTier);
    setPricingOpen(true);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, logout, refresh, openPricing }),
    [user, loading, login, logout, refresh, openPricing],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <PricingModal
        open={pricingOpen}
        onClose={() => setPricingOpen(false)}
        initialTier={pricingInitialTier}
      />
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
