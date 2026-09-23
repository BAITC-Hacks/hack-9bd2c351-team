import { beforeEach, describe, expect, it } from "vitest";
import { replyToMessage } from "@/lib/assistant";
import { clearSessions } from "@/lib/sessions";

describe("assistant acceptance flow", () => {
  beforeEach(clearSessions);

  it("returns grounded product and certificate data", () => {
    const response = replyToMessage("Show EKT-CB-16A", "a1");
    expect(response.message).toContain("Stock: 35");
    expect(response.message).toContain("EKT-CB-16A.pdf");
  });

  it("suggests an in-stock alternative for a zero-stock item", () => {
    const response = replyToMessage("Show EKT-CB-20A", "a2");
    expect(response.alternatives?.[0]?.sku).toBe("EKT-CB-20A-PRO");
  });

  it("answers purchase term questions", () => {
    expect(replyToMessage("What are the delivery terms?", "a3").message).toContain("delivery");
  });

  it("does not change the cart before explicit confirmation", () => {
    const proposal = replyToMessage("Add 2 EKT-CB-16A", "a4");
    expect(proposal.awaitingConfirmation).toBe(true);
    expect(proposal.cart).toHaveLength(0);
    expect(replyToMessage("okay", "a4").cart).toHaveLength(0);
  });

  it("adds within stock after explicit confirmation and returns a cart link", () => {
    replyToMessage("Add 2 EKT-CB-16A", "a5");
    const confirmed = replyToMessage("yes, add it", "a5");
    expect(confirmed.cart?.[0].quantity).toBe(2);
    expect(confirmed.cartUrl).toContain("/cart?sessionId=a5");
  });

  it("rejects quantities above stock", () => {
    const response = replyToMessage("Add 100 EKT-CB-16A", "a6");
    expect(response.cart).toHaveLength(0);
    expect(response.awaitingConfirmation).toBeUndefined();
  });
});

