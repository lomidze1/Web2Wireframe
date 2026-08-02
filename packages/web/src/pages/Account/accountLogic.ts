/**
 * Pure derivations for the account surfaces — the header chip, the Account
 * page's quota meter and the Checkout/Success order lines. Ported from the
 * design handoff's logic class, adapted to the one-time payment model
 * (no subscription, no auto-renewal).
 */

import { derivePrice, type BillingMode } from "../../components/ImportConsole/consoleLogic";

export type Plan = "free" | "pro";

export interface Usage {
  imports: number;
  limit: number | null;
}

const FREE_LIMIT = 10;

export function getInitials(email: string | null): string {
  const local = (email ?? "").split("@")[0].trim();
  if (!local) return "W2";
  return local.slice(0, 2).toUpperCase();
}

export function getChipLabel(plan: Plan, usage: Usage): string {
  if (plan === "pro") return "PRO";
  const limit = usage.limit ?? FREE_LIMIT;
  return `${usage.imports}/${limit}`;
}

export interface QuotaView {
  numeral: string;
  caption: string;
  pct: string;
  line: string;
}

export function getQuotaView(
  plan: Plan,
  imports: number,
  limit: number | null,
): QuotaView {
  if (plan === "pro") {
    return {
      numeral: String(imports),
      caption: "imports this month",
      pct: "100%",
      line: "Unlimited. The counter is only here so you can see how much work the plugin has taken off your desk.",
    };
  }
  const cap = limit ?? FREE_LIMIT;
  return {
    numeral: String(imports),
    caption: `of ${cap} imports used this month`,
    pct: `${Math.min(100, (imports / cap) * 100)}%`,
    line:
      imports >= cap - 2
        ? "Two left. A multi-viewport run still counts as one import — but an audit week will finish this in a morning."
        : "Each run counts once, however many viewports it produces. Unused imports don't carry over.",
  };
}

export interface OrderView {
  line: string;
  amount: string;
  payLabel: string;
  note: string;
  receipt: string;
}

export function getOrderView(billing: BillingMode): OrderView {
  const price = derivePrice(billing);
  if (billing === "annual") {
    return {
      line: "Pro — 12 months",
      amount: price.annual,
      payLabel: `Pay ${price.annual}`,
      note: `${price.annual} once for 365 days — ${price.perMonth} a month. No auto-renewal; renew only when you want.`,
      receipt: `${price.annual} charged — Pro for twelve months.`,
    };
  }
  return {
    line: "Pro — 1 month",
    amount: price.monthly,
    payLabel: `Pay ${price.monthly}`,
    note: `${price.monthly} once for 30 days. Switch to yearly any time and keep ${price.savePct}.`,
    receipt: `${price.monthly} charged — Pro for 30 days.`,
  };
}
