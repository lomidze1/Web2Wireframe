import { config } from "../config/env.js";
import type { SupportPlan } from "../types/index.js";

interface CustomerSubscription {
  tier: SupportPlan;
  verified: boolean;
  source: "lemon-squeezy" | "figma" | "default";
}

// In-memory store for customer subscriptions
// In production, this would be a database (PostgreSQL, MongoDB, etc.)
const customerSubscriptions = new Map<
  string,
  { plan: SupportPlan; expiresAt: number }
>();

/**
 * Determine user's plan tier from various sources
 *
 * Logic:
 * 1. Try to lookup in payment provider (Lemon Squeezy)
 * 2. Fall back to Figma API if available
 * 3. Use user-selected plan as hint (but validate server-side)
 * 4. Default to "Free" if cannot determine
 *
 * In production, implement proper webhook handlers for Lemon Squeezy
 * to keep the subscription store in sync.
 */
export const determinePlanTier = async (
  email: string,
  figmaUserId?: string,
  selectedPlanHint?: string
): Promise<CustomerSubscription> => {
  try {
    // Check in-memory store first (cache from webhook)
    if (customerSubscriptions.has(email)) {
      const cached = customerSubscriptions.get(email)!;
      if (cached.expiresAt > Date.now()) {
        return {
          tier: cached.plan,
          verified: true,
          source: "lemon-squeezy",
        };
      } else {
        customerSubscriptions.delete(email);
      }
    }

    // Try Lemon Squeezy API (requires subscription setup)
    if (config.lemonSqueezy.apiKey) {
      const lsResult = await lookupLemonSqueezySubscription(email);
      if (lsResult) {
        // Cache for 1 hour
        customerSubscriptions.set(email, {
          plan: lsResult,
          expiresAt: Date.now() + 3600000,
        });
        return {
          tier: lsResult,
          verified: true,
          source: "lemon-squeezy",
        };
      }
    }

    // Try Figma API (requires OAuth)
    if (figmaUserId && config.figma.clientId) {
      const figmaResult = await lookupFigmaUserSubscription(figmaUserId);
      if (figmaResult) {
        return {
          tier: figmaResult,
          verified: true,
          source: "figma",
        };
      }
    }

    // Use hint from client (but mark as unverified)
    if (selectedPlanHint && isPlanTier(selectedPlanHint)) {
      return {
        tier: selectedPlanHint as SupportPlan,
        verified: false,
        source: "default",
      };
    }

    // Default to Free
    return {
      tier: "Free",
      verified: false,
      source: "default",
    };
  } catch (error) {
    console.error("Error determining plan tier:", error);
    // Safe fallback
    return {
      tier: "Free",
      verified: false,
      source: "default",
    };
  }
};

/**
 * Lookup subscription in Lemon Squeezy
 * This requires your Lemon Squeezy API key
 * and proper setup of webhooks to keep data in sync
 */
async function lookupLemonSqueezySubscription(
  email: string
): Promise<SupportPlan | null> {
  if (!config.lemonSqueezy.apiKey) {
    return null;
  }

  try {
    // Example API call (adjust based on actual Lemon Squeezy API)
    const response = await fetch(
      `https://api.lemonsqueezy.com/v1/customers?email=${encodeURIComponent(
        email
      )}`,
      {
        headers: {
          Authorization: `Bearer ${config.lemonSqueezy.apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      data?: Array<{ id: string; attributes: { email: string } }>;
    };

    if (!data.data || data.data.length === 0) {
      return null;
    }

    // Get customer subscriptions
    const customerId = data.data[0].id;
    const subsResponse = await fetch(
      `https://api.lemonsqueezy.com/v1/customers/${customerId}/subscriptions`,
      {
        headers: {
          Authorization: `Bearer ${config.lemonSqueezy.apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!subsResponse.ok) {
      return null;
    }

    const subsData = (await subsResponse.json()) as {
      data?: Array<{
        attributes: {
          status: string;
          product_id: number;
        };
      }>;
    };

    if (!subsData.data || subsData.data.length === 0) {
      return null;
    }

    const activeSubscription = subsData.data.find(
      (s) => s.attributes.status === "active"
    );

    if (!activeSubscription) {
      return null;
    }

    // Map product ID to plan tier
    // This is your custom mapping - adjust based on your Lemon Squeezy setup
    const productId = activeSubscription.attributes.product_id;
    if (productId === parseInt(process.env.LEMON_SQ_PLUS_PRODUCT_ID || "0")) {
      return "Plus";
    }
    if (productId === parseInt(process.env.LEMON_SQ_PRO_PRODUCT_ID || "0")) {
      return "Pro";
    }

    return "Free";
  } catch (error) {
    console.error("Error querying Lemon Squeezy:", error);
    return null;
  }
}

/**
 * Lookup subscription via Figma API
 * Requires OAuth token or user context
 * This is a placeholder - implement based on Figma's API capabilities
 */
async function lookupFigmaUserSubscription(
  _figmaUserId: string
): Promise<SupportPlan | null> {
  // Figma doesn't currently expose subscription tier via public API
  // This is a placeholder for future implementation
  return null;
}

export const registerCustomerSubscription = (
  email: string,
  plan: SupportPlan,
  expiresAt: number
): void => {
  customerSubscriptions.set(email, { plan, expiresAt });
  console.log(
    `[Subscription] Registered ${email} as ${plan} (expires ${new Date(
      expiresAt
    ).toISOString()})`
  );
};

export const isPlanTier = (value: string): value is SupportPlan => {
  return ["Free", "Plus", "Pro"].includes(value);
};
