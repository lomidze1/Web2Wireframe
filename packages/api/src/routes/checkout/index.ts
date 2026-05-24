import { Router, type Request, type Response } from "express";
import {
  createOneTimeCheckout,
  cancelSubscription,
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
import { verifyToken } from "../../middleware/auth.js";
import { config } from "../../config/env.js";
import { WebhookEvent } from "../../models/WebhookEvent.js";
import { PLAN_PRICES, getProPriceCents, type ProDuration } from "../../models/License.js";

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
    if (!figmaUserId || typeof figmaUserId !== "string") {
      log.warn("missing figmaUserId");
      res.status(400).json({ error: "figmaUserId is required" });
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

    const result = await createOneTimeCheckout({
      figmaUserId,
      returnUrl,
      duration,
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
// ============================================================================
router.all("/success", (_req: Request, res: Response) => {
  res.redirect(303, `${config.website.baseUrl}/checkout/success`);
});

export default router;

// ============================================================================
// Webhook router (mounted separately so it can opt OUT of auth/CORS where
// needed). Flitt POSTs JSON to this endpoint after every charge attempt.
// ============================================================================

export const webhookRouter = Router();

webhookRouter.post("/flitt", async (req: Request, res: Response) => {
  // ALWAYS return 200 (or short-circuit early) — anything else triggers
  // Flitt's retry storm. Log internally; don't surface details.
  const log = createWebhookLogger();
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

    // Idempotency dedup. Prefer transaction_id; fall back to order_id +
    // order_status (covers approved retries vs. declined retries
    // separately, which is what we want).
    const transactionId =
      typeof payload.payment_id === "string"
        ? payload.payment_id
        : `${payload.order_id ?? "unknown"}_${payload.order_status ?? "unknown"}`;
    const orderId = String(payload.order_id ?? "unknown");
    const orderStatus = String(payload.order_status ?? "unknown");

    // Acquire the idempotency lease BEFORE doing work so a concurrent
    // Flitt retry can't double-apply. If state mutation later throws, the
    // inner try/catch below deletes this row so the next retry can succeed.
    try {
      await WebhookEvent.create({
        transactionId,
        orderId,
        orderStatus,
      });
    } catch (err) {
      // Duplicate key means we already processed this event — return 200.
      const code = (err as { code?: number }).code;
      if (code === 11000) {
        metrics.webhook(orderStatus, "deduped");
        res.status(200).json({ received: true, deduped: true });
        return;
      }
      throw err;
    }
    metrics.webhook(orderStatus, "processed");

    // Parse merchant_data → figmaUserId + plan + recurring flag.
    // The signature is verified at this point, but defense-in-depth: a
    // future bug elsewhere shouldn't let a non-object payload crash the
    // handler (which the outer catch would 200 — silently losing the
    // already-deduped event).
    let merchantData: {
      figmaUserId?: string;
      plan?: string;
      recurring?: boolean;
      duration?: string;
    } = {};
    if (typeof payload.merchant_data === "string") {
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
    }
    const figmaUserId =
      typeof merchantData.figmaUserId === "string"
        ? merchantData.figmaUserId
        : undefined;

    if (!figmaUserId) {
      log.warn("missing figmaUserId in merchant_data", { order_id: orderId });
      // No state change attempted, but the dedup lease above would still
      // block a retry from re-attempting. Release it so Flitt's retry has
      // a chance to land a corrected payload (e.g. operator-side fix).
      await releaseLease(transactionId, log);
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
      // Tampered/forged mapping — payload is hostile. Keep the dedup row
      // (drops any subsequent retry of the same hostile payload).
      res.status(200).json({ received: true });
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
      // Same as above — hostile or misconfigured payload. Lease retained.
      res.status(200).json({ received: true });
      return;
    }

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
          await sendReceiptEmail({
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
          });
        }
      } else if (orderStatus === "declined" || orderStatus === "expired") {
        log.info("one-time order non-approved — logged only", {
          order_id: orderId,
          figmaUserId,
          order_status: orderStatus,
        });
        if (typeof payload.sender_email === "string" && payload.sender_email) {
          await sendPaymentFailedNotification({
            email: payload.sender_email,
            figmaUserId,
          });
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
            await sendRefundNotification({ email: result.license.email });
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
            await sendReceiptEmail({
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
            });
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
          await sendPaymentFailedNotification({
            email: payload.sender_email,
            figmaUserId,
          });
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
            await sendRefundNotification({ email: result.license.email });
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
    log.error("handler error", {
      error: err instanceof Error ? err.message : String(err),
    });
    // Still return 200 — internal failures shouldn't trigger Flitt retries
    // (they'd just fail the same way). Operator should monitor logs.
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

// ============================================================================
// POST /api/subscription/cancel
// ----------------------------------------------------------------------------
// Website → backend. Body: { figmaUserId, token }.
// `token` is HMAC-signed by /api/auth/issue-cancel-token (5-min TTL),
// proving the cancel request originated from the plugin.
// ============================================================================

export const cancelRouter = Router();

cancelRouter.post("/cancel", async (req: Request, res: Response) => {
  const log = createLogger("subscription-cancel");
  try {
    const { figmaUserId, token } = req.body as {
      figmaUserId?: string;
      token?: string;
    };
    if (!figmaUserId || !token) {
      log.warn("missing figmaUserId or token");
      res.status(400).json({ error: "figmaUserId and token are required" });
      return;
    }
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      log.error("AUTH_SECRET env var is not set");
      res.status(500).json({ error: "Server auth not configured" });
      return;
    }

    let payload;
    try {
      payload = verifyToken(token, secret);
    } catch {
      // Generic message: distinguishing 'Invalid signature' from 'Token
      // expired' lets an attacker probe whether their guessed AUTH_SECRET is
      // correct by replaying expired tokens.
      log.warn("token verification failed", { figmaUserId });
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }
    if (payload.userId !== figmaUserId) {
      log.warn("token userId mismatch", {
        figmaUserId,
        token_userId: payload.userId,
      });
      res.status(401).json({ error: "Token does not match figmaUserId" });
      return;
    }

    const license = await licenseService.getOrCreate(figmaUserId);
    if (license.plan !== "pro" || !license.subscription) {
      log.info("no active Pro to cancel", {
        figmaUserId,
        plan: license.plan,
      });
      res.status(404).json({ error: "No active Pro subscription" });
      return;
    }

    const flittResult = await cancelSubscription(
      license.subscription.flittOrderId,
    );
    if (!flittResult.ok) {
      log.warn("Flitt rejected cancel", {
        figmaUserId,
        error: flittResult.error,
      });
      res.status(502).json({ error: flittResult.error });
      return;
    }

    const updated = await licenseService.applySubscriptionCancel({
      figmaUserId,
    });
    log.info("subscription canceled", {
      figmaUserId,
      accessUntil: updated?.cycleEndsAt.toISOString() ?? null,
    });

    res.json({
      ok: true,
      accessUntil: updated?.cycleEndsAt.toISOString() ?? null,
    });
  } catch (err) {
    log.error("handler error", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ error: "Server error" });
  }
});
