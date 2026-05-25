import { Resend } from "resend";
import { config } from "../config/env.js";

type SubscribeResult = { ok: true } | { ok: false; error: string };

// Lazy init mirrors emailService — avoid crashing at import time when
// RESEND_API_KEY isn't set (test env, fresh dev clone).
let client: Resend | null = null;
function getClient(): Resend {
  if (!client) {
    client = new Resend(config.email.resendApiKey || "re_placeholder");
  }
  return client;
}

/** Test hook — drop the cached client so the next call rebuilds with a fresh mock. */
export function __resetNewsletterClientForTests(): void {
  client = null;
}

/**
 * True when both the API key and audience id are configured. Used by the
 * route to short-circuit with 503 instead of attempting a Resend call that
 * would fail with a misleading auth error.
 */
export function isNewsletterConfigured(): boolean {
  return Boolean(config.email.resendApiKey) && Boolean(config.newsletter.audienceId);
}

/**
 * Resend's "contact already in audience" response shape isn't documented as
 * a stable error code — match on the human-readable message instead. We
 * deliberately keep the check loose (just "already") so a Resend wording
 * change doesn't silently start surfacing duplicates as errors to the user.
 */
function isDuplicateContactError(message: string | undefined): boolean {
  if (!message) return false;
  return message.toLowerCase().includes("already");
}

export async function subscribeToNewsletter(
  rawEmail: string,
): Promise<SubscribeResult> {
  const email = rawEmail.trim().toLowerCase();
  const audienceId = config.newsletter.audienceId;
  if (!audienceId) {
    return { ok: false, error: "newsletter_not_configured" };
  }

  try {
    const result = await getClient().contacts.create({
      audience_id: audienceId,
      email,
      unsubscribed: false,
    });

    if (result.error) {
      if (isDuplicateContactError(result.error.message)) {
        return { ok: true };
      }
      return { ok: false, error: result.error.message ?? "unknown_resend_error" };
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
