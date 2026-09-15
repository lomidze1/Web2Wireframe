import { describe, it, expect, vi } from "vitest";
import { requestPlanModal, onPlanModalRequest } from "../ui/shared/planEvents";

describe("plan modal events", () => {
  it("delivers a request to subscribers until they unsubscribe", () => {
    const handler = vi.fn();
    const off = onPlanModalRequest(handler);

    requestPlanModal();
    expect(handler).toHaveBeenCalledTimes(1);

    off();
    requestPlanModal();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
