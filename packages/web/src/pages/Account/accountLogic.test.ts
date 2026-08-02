import { describe, it, expect } from "vitest";
import {
  getInitials,
  getChipLabel,
  getQuotaView,
  getOrderView,
} from "./accountLogic";

describe("initials", () => {
  it("takes the first two letters of the email's local part", () => {
    expect(getInitials("anna@lomidze.studio")).toBe("AN");
    expect(getInitials("g@x.io")).toBe("G");
  });

  it("falls back to the brand mark without an email", () => {
    expect(getInitials(null)).toBe("W2");
    expect(getInitials("")).toBe("W2");
  });
});

describe("chip label", () => {
  it("shows used/limit on the free plan", () => {
    expect(getChipLabel("free", { imports: 7, limit: 10 })).toBe("7/10");
    expect(getChipLabel("free", { imports: 0, limit: 10 })).toBe("0/10");
  });

  it("defaults a missing limit to 10 on free", () => {
    expect(getChipLabel("free", { imports: 3, limit: null })).toBe("3/10");
  });

  it("shows PRO on the pro plan", () => {
    expect(getChipLabel("pro", { imports: 128, limit: null })).toBe("PRO");
  });
});

describe("quota view", () => {
  it("free plan shows used of limit with a proportional meter", () => {
    const view = getQuotaView("free", 7, 10);
    expect(view.numeral).toBe("7");
    expect(view.caption).toBe("of 10 imports used this month");
    expect(view.pct).toBe("70%");
    expect(view.line).toBe(
      "Each run counts once, however many viewports it produces. Unused imports don't carry over.",
    );
  });

  it("switches to the warning line at two remaining", () => {
    const warning =
      "Two left. A multi-viewport run still counts as one import — but an audit week will finish this in a morning.";
    expect(getQuotaView("free", 8, 10).line).toBe(warning);
    expect(getQuotaView("free", 10, 10).line).toBe(warning);
    expect(getQuotaView("free", 7, 10).line).not.toBe(warning);
  });

  it("caps the meter at 100%", () => {
    expect(getQuotaView("free", 12, 10).pct).toBe("100%");
  });

  it("pro plan shows the count with a full meter and the unlimited line", () => {
    const view = getQuotaView("pro", 128, null);
    expect(view.numeral).toBe("128");
    expect(view.caption).toBe("imports this month");
    expect(view.pct).toBe("100%");
    expect(view.line).toBe(
      "Unlimited. The counter is only here so you can see how much work the plugin has taken off your desk.",
    );
  });
});

describe("order view", () => {
  it("annual order is a single yearly payment", () => {
    const order = getOrderView("annual");
    expect(order.line).toBe("Pro — 12 months");
    expect(order.amount).toBe("$144");
    expect(order.payLabel).toBe("Pay $144");
    expect(order.note).toBe(
      "$144 once for 365 days — $12 a month. No auto-renewal; renew only when you want.",
    );
    expect(order.receipt).toBe("$144 charged — Pro for twelve months.");
  });

  it("monthly order is a single 30-day payment", () => {
    const order = getOrderView("monthly");
    expect(order.line).toBe("Pro — 1 month");
    expect(order.amount).toBe("$16");
    expect(order.payLabel).toBe("Pay $16");
    expect(order.note).toBe(
      "$16 once for 30 days. Switch to yearly any time and keep 25%.",
    );
    expect(order.receipt).toBe("$16 charged — Pro for 30 days.");
  });
});
