import { config } from "../config/env.js";
import type { SupportPlan } from "../config/website-types.js";

interface CustomerSubscription {
  tier: SupportPlan;
  verified: boolean;
  source: "figma" | "default";
}

/**
 * Determine user's plan tier from various sources
 *
 * Logic:
 * 1. Try Figma API if available
 * 2. Use user-selected plan as hint (but validate server-side)
 * 3. Default to "Free" if cannot determine
 */
export const determinePlanTier = async (
  _email: string,
  figmaUserId?: string,
  selectedPlanHint?: string,
): Promise<CustomerSubscription> => {
  try {
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
 * Lookup subscription via Figma API
 * Requires OAuth token or user context
 * This is a placeholder - implement based on Figma's API capabilities
 */
async function lookupFigmaUserSubscription(
  _figmaUserId: string,
): Promise<SupportPlan | null> {
  // Figma doesn't currently expose subscription tier via public API
  // This is a placeholder for future implementation
  return null;
}

export const isPlanTier = (value: string): value is SupportPlan => {
  return ["Free", "Pro"].includes(value);
};
