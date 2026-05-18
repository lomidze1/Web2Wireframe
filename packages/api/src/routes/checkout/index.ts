import { Router, type Request, type Response } from "express";
import {
  createOneTimeCheckout,
  cancelSubscription,
  verifyCallback,
} from "../../services/flittService.js";
import { licenseService } from "../../services/licenseService.js";
import { verifyToken } from "../../middleware/auth.js";
import { config } from "../../config/env.js";
import { WebhookEvent } from "../../models/WebhookEvent.js";
import { PLAN_PRICES } from "../../models/License.js";

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
  try {
    const { figmaUserId, returnUrl } = req.body as {
      figmaUserId?: string;
      returnUrl?: string;
    };
    if (!figmaUserId || typeof figmaUserId !== "string") {
      res.status(400).json({ error: "figmaUserId is required" });
      return;
    }

    const result = await createOneTimeCheckout({ figmaUserId, returnUrl });
    if (!result.ok) {
      res.status(502).json({ error: result.error });
      return;
    }
    res.json({ checkoutUrl: result.checkoutUrl, orderId: result.orderId });
  } catch (err) {
    console.error("[Checkout] /create error:", err);
    res.status(500).json({ error: "Server error" });
  }
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
  try {
    const payload = req.body as Record<string, unknown>;
    if (!payload || typeof payload !== "object") {
      console.warn("[Flitt webhook] empty body");
      res.status(200).json({ received: true });
      return;
    }

    if (!verifyCallback(payload, config.flitt.secretKey)) {
      console.warn(
        "[Flitt webhook] signature verification failed",
        { order_id: payload.order_id },
      );
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
      console.warn("[Flitt webhook] missing/invalid required fields");
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
        res.status(200).json({ received: true, deduped: true });
        return;
      }
      throw err;
    }

    // Parse merchant_data → figmaUserId + plan + recurring flag.
    let merchantData: {
      figmaUserId?: string;
      plan?: string;
      recurring?: boolean;
    } = {};
    if (typeof payload.merchant_data === "string") {
      try {
        merchantData = JSON.parse(payload.merchant_data);
      } catch (err) {
        console.warn("[Flitt webhook] merchant_data parse failed", err);
      }
    }
    const figmaUserId = merchantData.figmaUserId;

    if (!figmaUserId) {
      console.warn("[Flitt webhook] missing figmaUserId in merchant_data");
      res.status(200).json({ received: true });
      return;
    }

    // The signed order_id must agree with merchant_data.figmaUserId — its
    // format is `w2w_pro_<sanitized figmaUserId>_<ts>` (see
    // buildSubscriptionOrderId). A mismatch means a tampered/forged mapping.
    const sanitizedUserId = figmaUserId.replace(/[^A-Za-z0-9_-]/g, "");
    if (!orderId.startsWith(`w2w_pro_${sanitizedUserId}_`)) {
      console.warn(
        "[Flitt webhook] order_id does not match merchant_data figmaUserId",
        { order_id: orderId },
      );
      res.status(200).json({ received: true });
      return;
    }

    // An approved charge must be for the expected Pro price — a webhook with
    // a smaller (or absent) amount must never grant Pro access.
    if (
      orderStatus === "approved" &&
      Number(payload.amount) !== PLAN_PRICES.pro.priceCents
    ) {
      console.warn(
        `[Flitt webhook] approved charge with unexpected amount=${String(
          payload.amount,
        )} — not granting Pro for ${figmaUserId}`,
      );
      res.status(200).json({ received: true });
      return;
    }

    // merchant_data.recurring === false marks a one-time purchase. The
    // subscription branch is parked — re-enabled when Flitt grants
    // subscriptions. Old webhook payloads have no `recurring` field, so they
    // fall through to the subscription branch (backward-compatible).
    const isOneTime = merchantData.recurring === false;

    if (isOneTime) {
      if (orderStatus === "approved") {
        const email =
          typeof payload.sender_email === "string"
            ? payload.sender_email
            : null;
        await licenseService.applyOneTimePurchase({
          figmaUserId,
          email,
          flittOrderId: orderId,
        });
      } else {
        // One-time orders only ever decline once — nothing to track.
        console.log(
          `[Flitt webhook] one-time order_status="${orderStatus}" for ${figmaUserId} — logged only`,
        );
      }
    } else {
      // Subscription path. parent_order_id is set on recurring renewals
      // (charge #2, #3, …); absence means initial activation.
      if (orderStatus === "approved") {
        const parentOrderId = payload.parent_order_id;
        if (parentOrderId && typeof parentOrderId === "string") {
          await licenseService.applyRecurringCharge({ figmaUserId });
        } else {
          const email =
            typeof payload.sender_email === "string"
              ? payload.sender_email
              : null;
          await licenseService.applySubscriptionActivation({
            figmaUserId,
            email,
            flittOrderId: orderId,
          });
        }
      } else if (orderStatus === "declined" || orderStatus === "expired") {
        await licenseService.applyFailedCharge({ figmaUserId });
      } else {
        // reversed / refund / processing — log only for now; manual
        // intervention via Flitt dashboard for chargebacks/refunds.
        console.log(
          `[Flitt webhook] unhandled order_status="${orderStatus}" for ${figmaUserId}`,
        );
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error("[Flitt webhook] handler error:", err);
    // Still return 200 — internal failures shouldn't trigger Flitt retries
    // (they'd just fail the same way). Operator should monitor logs.
    res.status(200).json({ received: true });
  }
});

// ============================================================================
// POST /api/subscription/cancel
// ----------------------------------------------------------------------------
// Website → backend. Body: { figmaUserId, token }.
// `token` is HMAC-signed by /api/auth/issue-cancel-token (5-min TTL),
// proving the cancel request originated from the plugin.
// ============================================================================

export const cancelRouter = Router();

cancelRouter.post("/cancel", async (req: Request, res: Response) => {
  try {
    const { figmaUserId, token } = req.body as {
      figmaUserId?: string;
      token?: string;
    };
    if (!figmaUserId || !token) {
      res.status(400).json({ error: "figmaUserId and token are required" });
      return;
    }
    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      console.error("[Cancel] AUTH_SECRET env var is not set");
      res.status(500).json({ error: "Server auth not configured" });
      return;
    }

    let payload;
    try {
      payload = verifyToken(token, secret);
    } catch (err) {
      res.status(401).json({ error: `Invalid token: ${(err as Error).message}` });
      return;
    }
    if (payload.userId !== figmaUserId) {
      res.status(401).json({ error: "Token does not match figmaUserId" });
      return;
    }

    const license = await licenseService.getOrCreate(figmaUserId);
    if (license.plan !== "pro" || !license.subscription) {
      res.status(404).json({ error: "No active Pro subscription" });
      return;
    }

    const flittResult = await cancelSubscription(
      license.subscription.flittOrderId,
    );
    if (!flittResult.ok) {
      console.error("[Cancel] Flitt rejected cancel:", flittResult.error);
      res.status(502).json({ error: flittResult.error });
      return;
    }

    const updated = await licenseService.applySubscriptionCancel({
      figmaUserId,
    });

    res.json({
      ok: true,
      accessUntil: updated?.cycleEndsAt.toISOString() ?? null,
    });
  } catch (err) {
    console.error("[Cancel] handler error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
