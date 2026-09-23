import { beforeEach, describe, expect, it } from "vitest";
import { replyToMessage } from "@/lib/assistant";
import { clearSessions } from "@/lib/sessions";
import { products } from "@/data/products";
import type { ProductLookup } from "@/lib/catalog";

const demoLookup = async (query: string): Promise<ProductLookup> => {
  const normalized = query.toLowerCase();
  const product = products.find((entry) => normalized.includes(entry.sku.toLowerCase()) || normalized.includes(entry.name.toLowerCase()));
  return product
    ? { product, source: "demo", availabilityVerified: false, complete: false }
    : { source: "unavailable", availabilityVerified: false, complete: false };
};

describe("assistant acceptance flow", () => {
  beforeEach(clearSessions);

  it("returns grounded demo product and certificate data with a clear availability label", async () => {
    const response = await replyToMessage("Show EKT-CB-16A", "a1", demoLookup);
    expect(response.message).toContain("Demo stock: 35");
    expect(response.message).toContain("EKT-CB-16A.pdf");
    expect(response.message).toContain("live availability could not be verified");
    expect(response.catalogSource).toBe("demo");
  });

  it("suggests an in-stock alternative for a zero-stock item", async () => {
    const response = await replyToMessage("Show EKT-CB-20A", "a2", demoLookup);
    expect(response.alternatives?.[0]?.sku).toBe("EKT-CB-20A-PRO");
  });

  it("answers purchase term questions", async () => {
    expect((await replyToMessage("What are the delivery terms?", "a3", demoLookup)).message).toContain("delivery");
  });

  it("does not change the cart before explicit confirmation", async () => {
    const proposal = await replyToMessage("Add 2 EKT-CB-16A", "a4", demoLookup);
    expect(proposal.awaitingConfirmation).toBe(true);
    expect(proposal.cart).toHaveLength(0);
    expect((await replyToMessage("okay", "a4", demoLookup)).cart).toHaveLength(0);
  });

  it("adds within stock after explicit confirmation and returns a cart link", async () => {
    await replyToMessage("Add 2 EKT-CB-16A", "a5", demoLookup);
    const confirmed = await replyToMessage("yes, add it", "a5", demoLookup);
    expect(confirmed.cart?.[0].quantity).toBe(2);
    expect(confirmed.cartUrl).toContain("/cart?sessionId=a5");
  });

  it("rechecks live stock at confirmation before changing the cart", async () => {
    let lookupCount = 0;
    const liveLookup = async (): Promise<ProductLookup> => {
      lookupCount += 1;
      const stock = lookupCount === 1 ? 2 : 1;
      const source = products[0];
      const product = { ...source, source: "live" as const, availability: "available" as const, availabilityVerified: true, stockByWarehouse: { Almaty: stock } };
      return { product, source: "live", availabilityVerified: true, complete: true };
    };

    const proposal = await replyToMessage("Add 2 EKT-CB-16A", "a7", liveLookup);
    expect(proposal.awaitingConfirmation).toBe(true);
    const confirmed = await replyToMessage("yes, add it", "a7", liveLookup);
    expect(confirmed.message).toContain("Stock changed");
    expect(confirmed.cart).toHaveLength(0);
    expect(confirmed.cartUrl).toBeUndefined();
    expect(lookupCount).toBe(2);
  });

  it("rejects quantities above stock", async () => {
    const response = await replyToMessage("Add 100 EKT-CB-16A", "a6", demoLookup);
    expect(response.cart).toHaveLength(0);
    expect(response.awaitingConfirmation).toBeUndefined();
  });
});
