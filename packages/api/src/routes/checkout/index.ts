import { Router, type Request, type Response } from "express";
import {
  createOneTimeCheckout,
  verifyCallback,
} from "../../services/flittService.js";
import { licenseService } from "../../services/licenseService.js";
import {
  sendRefundNotification,
  sendPaymentFailedNotification,
  sendReceiptEmail,
} from "../../services/emailService.js";
import {
  createLogger,
  createWebhookLogger,
} from "../../services/webhookLogger.js";
import { metrics } from "../../services/metrics.js";
import { config } from "../../config/env.js";
import { WebhookEvent } from "../../models/WebhookEvent.js";
import { CancellationEvent } from "../../models/CancellationEvent.js";
import {
  PLAN_PRICES,
  getProPriceCents,
  getRenewalWindowMs,
  type ProDuration,
} from "../../models/License.js";
import { assertStringMax } from "../../lib/validators.js";

// Figma user ids are short (~12 chars in practice). 64 is ample headroom for
// any future Figma id format while bounding storage amplification in
// WebhookEvent.orderId, audit logs, and CancellationEvent rows (H-4).
const FIGMA_USER_ID_MAX = 64;

const router = Router();

// ============================================================================
// POST /api/checkout/create
// ----------------------------------------------------------------------------
// Plugin → backend → Flitt. Returns the hosted checkout URL.
// Public: figmaUserId in body is the bearer credential (consistent with
// /api/license/me). Worst-case abuse = attacker creates a Pro subscription
// invoice for someone else; the victim still has to enter their card to
// complete the payment, so it's harmless beyond UX confusion.
// ============================================================================

router.post("/create", async (req: Request, res: Response) => {
  const log = createLogger("checkout-create");
  try {
    const { figmaUserId, returnUrl, plan } = req.body as {
      figmaUserId?: string;
      returnUrl?: string;
      plan?: string;
    };
    try {
      assertStringMax(figmaUserId, "figmaUserId", FIGMA_USER_ID_MAX);
    } catch {
      log.warn("invalid figmaUserId", {
        type: typeof figmaUserId,
        length:
          typeof figmaUserId === "string" ? figmaUserId.length : undefined,
      });
      res.status(400).json({
        error: `figmaUserId is required (max ${FIGMA_USER_ID_MAX} chars)`,
      });
      return;
    }

    // Plan tier — defaults to "monthly" if omitted so the existing single-tier
    // CTA keeps working. Reject anything else explicitly so a typo can't
    // silently fall back to monthly and undercharge a yearly buyer.
    let duration: ProDuration = "monthly";
    if (plan !== undefined) {
      if (plan !== "monthly" && plan !== "yearly") {
        log.warn("invalid plan", { figmaUserId, plan });
        res.status(400).json({ error: "plan must be 'monthly' or 'yearly'" });
        return;
      }
      duration = plan;
    }

    // P2-#1: refuse to open Flitt checkout for an active Pro user with more
    // than `renewalWindow` time remaining. Without this, a fraudster can
    // pay $16 × N to accumulate N × 30 days of Pro, then chargeback all
    // but the most-recent — `applyRefund` only revokes when flittOrderId
    // matches the current subscription, so older refunds become no-ops
    // and the user keeps the stacked time.
    //
    // Honest user UX: at 30-day cap, renewal opens with 7 days left
    // (≤ 7 days remaining) → user buys → gets 37 days total. Outside that
    // window, the plugin/web should show "you already have Pro".
    //
    // licenseService.getOrCreate handles cycle reset + downgrade-on-read,
    // so the read here always reflects the current effective state.
    //
    // We also opportunistically pull license.email here so the downstream
    // Flitt request can include `sender_email` — populates the portal's
    // "Customer email" column and triggers Flitt's own receipt mail. The
    // field is null until the user completes Figma OAuth on the website,
    // so anonymous plugin checkouts simply skip it.
    let senderEmail: string | undefined;
    try {
      const license = await licenseService.getOrCreate(figmaUserId);
      if (license.email) {
        senderEmail = license.email;
      }
      if (license.plan === "pro") {
        const now = Date.now();
        const remainingMs = license.cycleEndsAt.getTime() - now;
        const renewalWindowMs = getRenewalWindowMs(duration);
        if (remainingMs > renewalWindowMs) {
          const remainingDays = Math.ceil(remainingMs / (24 * 60 * 60 * 1000));
          const renewalOpensInDays = Math.max(
            0,
            Math.ceil((remainingMs - renewalWindowMs) / (24 * 60 * 60 * 1000)),
          );
          log.info("checkout blocked — active Pro outside renewal window", {
            figmaUserId,
            plan: duration,
            remainingDays,
            renewalOpensInDays,
          });
          metrics.checkoutCreate("fail");
          res.status(400).json({
            error: "already_pro",
            remainingDays,
            renewalOpensInDays,
            renewalWindowDays:
              duration === "yearly" ? 10 : 7,
          });
          return;
        }
      }
    } catch (err) {
      // License read failed (Mongo blip). Don't block checkout — fall through
      // and let the user buy. The webhook handler's defensive cap below
      // still prevents unbounded stacking even if this read misses.
      // senderEmail stays undefined → flittService omits the field; same
      // behavior as pre-email release on this code path.
      //
      // We surface BOTH the lost active-Pro guard AND the omitted
      // sender_email in the same warn so a support engineer reading logs
      // can immediately diagnose a "blank Customer email column" report
      // against a Mongo outage without correlating two facts manually.
      log.warn(
        "checkout pre-block license read failed (non-fatal) — sender_email omitted",
        {
          figmaUserId,
          error: err instanceof Error ? err.message : String(err),
        },
      );
    }

    const result = await createOneTimeCheckout({
      figmaUserId,
      returnUrl,
      duration,
      senderEmail,
    });
    if (!result.ok) {
      log.warn("Flitt rejected checkout creation", {
        figmaUserId,
        plan: duration,
        error: result.error,
      });
      metrics.checkoutCreate("fail");
      res.status(502).json({ error: result.error });
      return;
    }
    log.info("checkout created", {
      figmaUserId,
      plan: duration,
      orderId: result.orderId,
    });
    metrics.checkoutCreate("success");
    res.json({ checkoutUrl: result.checkoutUrl, orderId: result.orderId });
  } catch (err) {
    log.error("handler error", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Server error" });
  }
});

// ============================================================================
// ALL /api/checkout/success
// ----------------------------------------------------------------------------
// Flitt's `response_url` redirect is sent as a POST when the user completes
// payment (form auto-submit on their success page). The marketing website's
// /checkout/success route is a static SPA path served by nginx, which only
// answers GET — so the first hit returns 405 and the user has to refresh
// before they see the success card.
//
// This bridge accepts POST (and GET, defensively) on the API host and 303-
// redirects to the website. A 303 forces the browser to follow with GET
// regardless of the original method, which resolves the 405 cleanly. No
// signature verification needed — the real activation is the separately
// signed webhook to /api/webhooks/flitt; this endpoint only steers the
// user's browser.
//
// Logging: users have reported an intermittent "Internal server error"
// landing after a real Flitt payment, which curl can't reproduce. We emit
// one structured log line per hit (method, content-type, body field KEYS,
// safe order metadata, referer, user-agent) so the next failure is
// diagnosable from Render logs without a separate repro session. The
// createLogger sanitizer drops `signature` / `sender_email` / `payment_id`
// before serialization — those never reach stdout.
// ============================================================================
// Cap on logged body-key count. Flitt's real payload is ~15 fields; anything
// past this is either a future Flitt schema extension we don't recognize, or
// an attacker spamming the endpoint with thousands of synthetic keys to bloat
// Render's NDJSON stream. 32 leaves comfortable headroom over the real
// payload while bounding any single log line below ~1KB worth of key names.
const SUCCESS_BRIDGE_LOG_KEY_CAP = 32;

router.all("/success", (req: Request, res: Response) => {
  const log = createLogger("checkout-success-bridge");
  const body =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>)
      : {};
  const allKeys = Object.keys(body);
  log.info("flitt response_url bridge hit", {
    method: req.method,
    contentType: req.headers["content-type"] ?? null,
    // Truncate to a fixed cap so a hostile or misconfigured client posting
    // thousands of synthetic keys can't bloat log volume. Real Flitt
    // payloads sit far under the cap; emitting `bodyKeysTotal` separately
    // makes truncation observable.
    bodyKeys: allKeys.slice(0, SUCCESS_BRIDGE_LOG_KEY_CAP),
    bodyKeysTotal: allKeys.length,
    // order_id + order_status are safe to log as-is (no PII, no signature).
    // They're also the join key on the Flitt portal so they're the most
    // useful breadcrumb when reconciling a failure with a specific charge.
    orderId: typeof body.order_id === "string" ? body.order_id : null,
    orderStatus:
      typeof body.order_status === "string" ? body.order_status : null,
    referer: req.get("referer") ?? null,
    userAgent: req.get("user-agent") ?? null,
  });

  // `res.redirect` is synchronous in Express 4 and does not throw on any
  // documented path — the only failure mode is "headers already sent",
  // which Express silently no-ops rather than raising. Guard explicitly so
  // an upstream middleware that ended the response can't trigger Express's
  // global error handler ("Internal server error") here.
  if (res.headersSent) {
    log.error("response already sent before bridge — cannot redirect", {});
    return;
  }
  res.redirect(303, `${config.website.baseUrl}/checkout/success`);
});

// ============================================================================
// ALL /api/checkout/cancel
// ----------------------------------------------------------------------------
// Flitt redirects here when the payment was DECLINED / EXPIRED or the user
// clicked Cancel on the hosted checkout. Mirror of `/success` bridge.
//
// In addition to the 303 → website redirect, we log a CancellationEvent row
// for retention analytics (Phase 1) so we can later drive a comeback-offer
// flow (Phase 2). Logging is best-effort:
//   - Signature is verified using the same SHA1 algorithm as the webhook
//     handler. A failed verify means we still redirect (UX must work for
//     anyone who lands on this URL), but we mark `signatureValid: false` on
//     the row so analytics can filter out spoofed/test traffic.
//   - merchant_data is parsed for figmaUserId, which is the join key for
//     Phase 2 email follow-ups.
//   - sender_email is captured opportunistically — Flitt provides it for
//     guest checkouts where the customer entered their email.
//
// Distinct from `WebhookEvent`: that table guards idempotency on the
// state-mutating webhook path; this one is informational only.
// ============================================================================
router.all("/cancel", async (req: Request, res: Response) => {
  const log = createLogger("checkout-cancel-bridge");
  try {
    const payload = req.body as Record<string, unknown> | undefined;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const orderId =
        typeof payload.order_id === "string" ? payload.order_id : "unknown";
      const orderStatus =
        typeof payload.order_status === "string"
          ? payload.order_status
          : "unknown";
      const paymentId =
        typeof payload.payment_id === "string" ? payload.payment_id : null;
      const senderEmail =
        typeof payload.sender_email === "string" ? payload.sender_email : null;
      const amountRaw = payload.amount;
      const amount =
        typeof amountRaw === "number"
          ? amountRaw
          : typeof amountRaw === "string"
            ? Number(amountRaw)
            : null;
      const currency =
        typeof payload.currency === "string" ? payload.currency : null;

      // Parse figmaUserId out of merchant_data (same shape as webhook handler).
      let figmaUserId: string | null = null;
      if (typeof payload.merchant_data === "string") {
        try {
          const parsed: unknown = JSON.parse(payload.merchant_data);
          if (
            parsed !== null &&
            typeof parsed === "object" &&
            !Array.isArray(parsed) &&
            typeof (parsed as { figmaUserId?: unknown }).figmaUserId ===
              "string"
          ) {
            figmaUserId = (parsed as { figmaUserId: string }).figmaUserId;
          }
        } catch {
          // best-effort
        }
      }

      const signatureValid = verifyCallback(payload, config.flitt.secretKey);

      try {
        await CancellationEvent.create({
          transactionId: paymentId ?? orderId,
          orderId,
          orderStatus,
          figmaUserId,
          email: senderEmail,
          amount: Number.isFinite(amount as number) ? (amount as number) : null,
          currency,
          signatureValid,
        });
        log.info("cancellation event logged", {
          order_id: orderId,
          order_status: orderStatus,
          figmaUserId,
          signatureValid,
        });
      } catch (err) {
        log.warn("failed to log cancellation event (non-fatal)", {
          order_id: orderId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } catch (err) {
    log.error("cancel bridge handler error (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  // Always redirect — UX must work regardless of logging outcome.
  res.redirect(303, `${config.website.baseUrl}/checkout/cancel`);
});

export default router;

// ============================================================================
// Webhook router (mounted separately so it can opt OUT of auth/CORS where
// needed). Flitt POSTs JSON to this endpoint after every charge attempt.
// ============================================================================

export const webhookRouter = Router();

/**
 * P2-#2: best-effort email helper used inside the webhook mutation block.
 *
 * Before this helper existed, a thrown error from `sendReceiptEmail` (e.g.
 * `RESEND_API_KEY` missing in container) bubbled into the mutation try/catch
 * and triggered `releaseLease()` — so the user's Pro was granted, the lease
 * was released, Flitt retried, and the user got 60 days for $16. The
 * helper isolates transport failures so the mutation catch only fires on
 * REAL state-mutation errors.
 *
 * Failures emit `metrics.email(template, "fail")` so operators can alert
 * on email outages.
 */
type EmailLogger = Pick<ReturnType<typeof createWebhookLogger>, "warn">;
async function bestEffortEmail(
  send: () => Promise<unknown>,
  template: string,
  log: EmailLogger,
): Promise<void> {
  try {
    await send();
  } catch (err) {
    log.warn(`email[${template}] send failed (non-fatal)`, {
      error: err instanceof Error ? err.message : String(err),
    });
    metrics.email(template, "fail");
  }
}

webhookRouter.post("/flitt", async (req: Request, res: Response) => {
  // ALWAYS return 200 (or short-circuit early) — anything else triggers
  // Flitt's retry storm. Log internally; don't surface details.
  //
  // M-4 ordering invariant: validation runs BEFORE we acquire the
  // idempotency lease. A hostile or tampered payload must not consume a
  // dedup key (it would block legitimate retries with the same payment_id
  // if Flitt were to deliver a corrected version). State mutation runs
  // AFTER the lease — so a mid-mutation crash still has the inner catch
  // to release the lease, and a *pre-mutation* crash has the outer catch
  // to release it (if `transactionId` was set). This is the bug M-4
  // protects against: previously a JSON.parse OOM mid-validation would
  // silently swallow a paid event.
  const log = createWebhookLogger();
  let transactionId: string | undefined;
  try {
    const payload = req.body as Record<string, unknown>;
    if (!payload || typeof payload !== "object") {
      log.warn("empty body");
      res.status(200).json({ received: true });
      return;
    }

    if (!verifyCallback(payload, config.flitt.secretKey)) {
      log.warn("signature verification failed", { order_id: payload.order_id });
      metrics.signatureFailure();
      res.status(200).json({ received: true });
      return;
    }

    // Required fields — reject malformed/partial webhooks before any state
    // change. order_status/order_id/amount/merchant_data each drive activation.
    if (
      typeof payload.merchant_data !== "string" ||
      typeof payload.order_id !== "string" ||
      typeof payload.order_status !== "string" ||
      payload.amount === undefined ||
      payload.amount === null
    ) {
      log.warn("missing/invalid required fields", {
        order_id: payload.order_id,
      });
      res.status(200).json({ received: true });
      return;
    }

    const orderId = String(payload.order_id);
    const orderStatus = String(payload.order_status);

    // Parse merchant_data → figmaUserId + plan + recurring flag.
    // The signature is verified at this point, but defense-in-depth: a
    // future bug elsewhere shouldn't let a non-object payload crash the
    // handler (which the outer catch would 200).
    let merchantData: {
      figmaUserId?: string;
      plan?: string;
      recurring?: boolean;
      duration?: string;
    } = {};
    try {
      const parsed: unknown = JSON.parse(payload.merchant_data);
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
      ) {
        merchantData = parsed as typeof merchantData;
      } else {
        log.warn("merchant_data parsed to non-object — treating as empty", {
          order_id: orderId,
          parsedType: Array.isArray(parsed) ? "array" : typeof parsed,
        });
      }
    } catch (err) {
      log.warn("merchant_data parse failed", {
        order_id: orderId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    const figmaUserId =
      typeof merchantData.figmaUserId === "string"
        ? merchantData.figmaUserId
        : undefined;

    if (!figmaUserId) {
      log.warn("missing figmaUserId in merchant_data", { order_id: orderId });
      metrics.webhook(orderStatus, "rejected");
      res.status(200).json({ received: true });
      return;
    }

    // P2-#3: cap figmaUserId length here too. /api/checkout/create rejects
    // oversized values at issue time, but a tampered merchant_data field
    // delivered via a future Flitt API-version quirk could still smuggle a
    // huge id into the webhook path. Plain length check (not assertStringMax)
    // because the webhook must NEVER 4xx — Flitt would retry-storm.
    if (figmaUserId.length > FIGMA_USER_ID_MAX) {
      log.warn("figmaUserId exceeds length cap", {
        order_id: orderId,
        length: figmaUserId.length,
      });
      metrics.webhook(orderStatus, "rejected");
      res.status(200).json({ received: true });
      return;
    }

    // The signed order_id must agree with merchant_data.figmaUserId — its
    // format is `w2w_pro_<sanitized figmaUserId>_<ts>` (see
    // buildSubscriptionOrderId). A mismatch means a tampered/forged mapping.
    const sanitizedUserId = figmaUserId.replace(/[^A-Za-z0-9_-]/g, "");
    if (!orderId.startsWith(`w2w_pro_${sanitizedUserId}_`)) {
      log.warn("order_id does not match merchant_data figmaUserId", {
        order_id: orderId,
        figmaUserId,
      });
      metrics.webhook(orderStatus, "rejected");
      res.status(200).json({ received: true });
      return;
    }

    // M-9: currency must be USD. We bill exclusively in USD; any other
    // currency means either a misconfigured Flitt merchant account
    // (operator-side bug) or a tampered payload that slipped through
    // because the field isn't part of the signature canonicalization for
    // certain Flitt API versions. Reject either way before granting Pro.
    const currency =
      typeof payload.currency === "string"
        ? payload.currency.toUpperCase()
        : "";
    if (currency !== "USD") {
      log.warn("non-USD currency — rejecting payload", {
        order_id: orderId,
        figmaUserId,
        currency: payload.currency,
      });
      metrics.webhook(orderStatus, "rejected");
      res.status(200).json({ received: true, rejected: "currency" });
      return;
    }

    // Tier-aware amount validation. Legacy payloads with no `duration` field
    // are treated as monthly (the only tier that existed before this). Any
    // other value is suspicious and never grants Pro access.
    const durationField =
      merchantData.duration === "yearly" ||
      merchantData.duration === "monthly"
        ? (merchantData.duration as ProDuration)
        : "monthly";
    const expectedAmount = getProPriceCents(durationField);
    if (
      orderStatus === "approved" &&
      Number(payload.amount) !== expectedAmount
    ) {
      log.warn("approved charge with unexpected amount — not granting Pro", {
        order_id: orderId,
        figmaUserId,
        amount: payload.amount,
        expectedAmount,
        duration: durationField,
      });
      metrics.webhook(orderStatus, "rejected");
      res.status(200).json({ received: true });
      return;
    }

    // ALL validation has passed. NOW acquire the idempotency lease — only
    // a payload we'd legitimately act on gets to consume a dedup key.
    // Concurrent Flitt retries land here and dedup correctly because the
    // unique index on `transactionId` rejects the second insert.
    transactionId =
      typeof payload.payment_id === "string"
        ? payload.payment_id
        : `${orderId}_${orderStatus}`;
    // Record the real charge amount so admin-stats can sum actual dollars
    // (yearly $144 vs monthly $16) instead of assuming every charge is
    // monthly. Only persist a finite number — a non-numeric amount (possible
    // on statuses that skip the approved-only amount check) is left absent,
    // and stats falls back to the monthly price.
    const amountCents = Number(payload.amount);
    try {
      await WebhookEvent.create({
        transactionId,
        orderId,
        orderStatus,
        ...(Number.isFinite(amountCents) ? { amountCents } : {}),
      });
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 11000) {
        metrics.webhook(orderStatus, "deduped");
        res.status(200).json({ received: true, deduped: true });
        // Concurrent delivery already won the lease — they own the
        // mutation, not us. Wipe transactionId so the outer catch
        // doesn't release THEIR lease if we somehow throw below.
        transactionId = undefined;
        return;
      }
      throw err;
    }
    metrics.webhook(orderStatus, "processed");

    // merchant_data.recurring === false marks a one-time purchase. The
    // subscription branch is parked — re-enabled when Flitt grants
    // subscriptions. Old webhook payloads have no `recurring` field, so they
    // fall through to the subscription branch (backward-compatible).
    const isOneTime = merchantData.recurring === false;

    // Wrap every state-mutating branch in a single try/catch so the dedup
    // lease can be released if mutation fails. Without this, a Mongo blip
    // mid-applyOneTimePurchase would leave the lease in place and the
    // Flitt retry would dedup → silently lose the event.
    try {
    if (isOneTime) {
      if (orderStatus === "approved") {
        const email =
          typeof payload.sender_email === "string"
            ? payload.sender_email
            : null;
        const updated = await licenseService.applyOneTimePurchase({
          figmaUserId,
          email,
          flittOrderId: orderId,
          duration: durationField,
        });
        log.info("one-time purchase approved", {
          order_id: orderId,
          figmaUserId,
          amount: payload.amount,
          duration: durationField,
        });
        if (email) {
          await bestEffortEmail(
            () =>
              sendReceiptEmail({
                email,
                amountCents: Number(payload.amount),
                currency: String(payload.currency ?? PLAN_PRICES.pro.currency),
                orderId,
                paymentId:
                  typeof payload.payment_id === "string"
                    ? payload.payment_id
                    : null,
                purchasedAt: new Date(),
                proExpiresAt: updated.cycleEndsAt,
              }),
            "receipt",
            log,
          );
        }
      } else if (orderStatus === "declined" || orderStatus === "expired") {
        log.info("one-time order non-approved — logged only", {
          order_id: orderId,
          figmaUserId,
          order_status: orderStatus,
        });
        if (typeof payload.sender_email === "string" && payload.sender_email) {
          await bestEffortEmail(
            () =>
              sendPaymentFailedNotification({
                email: payload.sender_email as string,
                figmaUserId,
              }),
            "payment-failed",
            log,
          );
        }
      } else if (orderStatus === "reversed") {
        // Refund / chargeback for a one-time purchase. Same revocation rule as
        // the subscription branch: applyRefund only revokes if the refunded
        // order_id is still the user's current order — a refund for an older
        // (since-replaced) order is a no-op. Email is best-effort.
        const result = await licenseService.applyRefund({
          figmaUserId,
          flittOrderId: orderId,
        });
        if (result.revoked) {
          log.warn("reversed → Pro revoked (one-time)", {
            order_id: orderId,
            figmaUserId,
          });
          if (result.license?.email) {
            await bestEffortEmail(
              () =>
                sendRefundNotification({
                  email: result.license!.email as string,
                }),
              "refund",
              log,
            );
          }
        } else {
          log.info("reversed for stale/missing one-time order — no action", {
            order_id: orderId,
            figmaUserId,
          });
        }
      } else {
        log.info("one-time unhandled order_status", {
          order_id: orderId,
          figmaUserId,
          order_status: orderStatus,
        });
      }
    } else {
      // Subscription path. parent_order_id is set on recurring renewals
      // (charge #2, #3, …); absence means initial activation.
      if (orderStatus === "approved") {
        const parentOrderId = payload.parent_order_id;
        if (parentOrderId && typeof parentOrderId === "string") {
          await licenseService.applyRecurringCharge({ figmaUserId });
          log.info("recurring charge approved", {
            order_id: orderId,
            figmaUserId,
            parent_order_id: parentOrderId,
          });
        } else {
          const email =
            typeof payload.sender_email === "string"
              ? payload.sender_email
              : null;
          const updated = await licenseService.applySubscriptionActivation({
            figmaUserId,
            email,
            flittOrderId: orderId,
          });
          log.info("subscription activation approved", {
            order_id: orderId,
            figmaUserId,
          });
          if (email) {
            await bestEffortEmail(
              () =>
                sendReceiptEmail({
                  email,
                  amountCents: Number(payload.amount),
                  currency: String(payload.currency ?? PLAN_PRICES.pro.currency),
                  orderId,
                  paymentId:
                    typeof payload.payment_id === "string"
                      ? payload.payment_id
                      : null,
                  purchasedAt: new Date(),
                  proExpiresAt: updated.cycleEndsAt,
                }),
              "receipt",
              log,
            );
          }
        }
      } else if (orderStatus === "declined" || orderStatus === "expired") {
        await licenseService.applyFailedCharge({ figmaUserId });
        log.info("charge failed", {
          order_id: orderId,
          figmaUserId,
          order_status: orderStatus,
        });
        // Best-effort customer notification — only fires when Flitt actually
        // collected an email on the checkout form. For declines from automated
        // recurring charges (no checkout form), sender_email is typically
        // absent; that user is already getting a separate expiry reminder.
        if (typeof payload.sender_email === "string" && payload.sender_email) {
          await bestEffortEmail(
            () =>
              sendPaymentFailedNotification({
                email: payload.sender_email as string,
                figmaUserId,
              }),
            "payment-failed",
            log,
          );
        }
      } else if (orderStatus === "reversed") {
        // Refund / chargeback. applyRefund only revokes if THIS order_id is
        // still the user's current subscription — a refund for an older
        // (since-replaced) order is a no-op. Email is best-effort.
        const result = await licenseService.applyRefund({
          figmaUserId,
          flittOrderId: orderId,
        });
        if (result.revoked) {
          log.warn("reversed → Pro revoked", {
            order_id: orderId,
            figmaUserId,
          });
          if (result.license?.email) {
            await bestEffortEmail(
              () =>
                sendRefundNotification({
                  email: result.license!.email as string,
                }),
              "refund",
              log,
            );
          }
        } else {
          log.info("reversed for stale/missing order — no action", {
            order_id: orderId,
            figmaUserId,
          });
        }
      } else {
        // processing / other transient — log only.
        log.info("unhandled order_status", {
          order_id: orderId,
          figmaUserId,
          order_status: orderStatus,
        });
      }
    }
    } catch (mutationErr) {
      // State mutation crashed mid-flight (Mongo blip, Resend init error,
      // unexpected throw from a service layer). Release the dedup lease so
      // Flitt's retry can land a fresh attempt — otherwise the user paid
      // and never got Pro.
      log.error("state mutation failed — releasing dedup lease for retry", {
        order_id: orderId,
        figmaUserId,
        error:
          mutationErr instanceof Error ? mutationErr.message : String(mutationErr),
      });
      await releaseLease(transactionId, log);
      // Still 200 — Flitt's retry will redeliver; a 5xx here just delays
      // the retry by Flitt's own backoff schedule with no benefit.
      res.status(200).json({ received: true });
      return;
    }

    res.status(200).json({ received: true });
  } catch (err) {
    log.error("handler crashed", {
      transactionId,
      error: err instanceof Error ? err.message : String(err),
    });
    // M-4: release the lease if we acquired one. Without this, a Mongo
    // blip mid-mutation (or any unexpected throw after the lease) would
    // leave the dedup row in place forever — Flitt's retry would dedup
    // and the user would pay but never receive Pro. `releaseLease` is a
    // no-op when transactionId is undefined or unknown, so this is safe
    // both pre- and post-lease.
    if (transactionId) {
      await releaseLease(transactionId, log);
      metrics.webhook("unknown", "crashed");
    }
    // Still return 200 — internal failures shouldn't trigger Flitt retries
    // immediately; Flitt's own backoff cadence will redeliver, and the
    // released lease lets that delivery succeed.
    res.status(200).json({ received: true });
  }
});

/**
 * Drop the WebhookEvent idempotency row for `transactionId`. Used after a
 * state-mutation failure so the next Flitt retry isn't deduped into a
 * silent loss. Best-effort — failure here logs and continues; the worst
 * case is "this specific webhook never reprocesses", which is the same
 * state we'd be in without rollback.
 */
async function releaseLease(
  transactionId: string,
  log: { warn: (msg: string, ctx?: Record<string, unknown>) => void },
): Promise<void> {
  try {
    await WebhookEvent.deleteOne({ transactionId });
  } catch (err) {
    log.warn("lease release failed (non-fatal)", {
      transactionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// P2-#11: `cancelRouter` (POST /api/subscription/cancel) was removed.
// Web2Wireframe ships a one-time-payment model — there is no recurring
// subscription to cancel. The website "Cancel" UI was already dropped in
// commit 11ff22f. The unrelated `/api/checkout/cancel` bridge above is the
// one Flitt redirects users to on declined/expired payments or when they
// click "Cancel" on the hosted checkout — that flow remains live.
//
// `/api/auth/issue-cancel-token` (routes/plugin/auth-token.ts) is kept
// because its only remaining consumer is `/api/license/by-token`, which
// the website Account page uses to read license details. The "cancel"
// in the endpoint name is legacy — the token's actual purpose is
// "license read".
