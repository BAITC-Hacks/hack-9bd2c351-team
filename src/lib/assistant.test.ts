import { beforeEach, describe, expect, it, vi } from "vitest";
import { replyToMessage, parseQuantity, type Lookup } from "@/lib/assistant";
import { findDemoProduct, lookupMentionedProduct, searchProducts, suggestAlternatives } from "@/lib/catalog";
import { clearSessions, getSession } from "@/lib/sessions";
import { products } from "@/data/products";
import type { Product } from "@/lib/types";
const sample = products[0];
const reply = (message: string, id = "one") => replyToMessage(message, id, lookupMentionedProduct, { skipLanguage: true });
function liveLookup(product: Product): Lookup { return async () => ({ product, source: "live", complete: true, availabilityVerified: true }); }

describe("specification acceptance", () => {
  beforeEach(() => { clearSessions(); vi.stubEnv("CATALOG_MODE", "demo"); vi.stubEnv("GEMINI_API_KEY", ""); });
  it("returns exact catalog facts, warehouses and a working local certificate reference", async () => {
    const answer = await reply("Наличие EKT-CB-16A и сертификат");
    expect(answer.product?.price).toBe(2450);
    expect(answer.product?.stockByWarehouse).toEqual({ Алматы: 24, Астана: 11 });
    expect(answer.product?.specifications.ratedCurrent).toBe("16 A");
    expect(answer.product?.certificateUrl).toBe("/certificates/EKT-CB-16A.txt");
    expect(answer.message).toContain("Демо-остаток: 35");
    expect(answer.availabilityVerified).toBe(false);
  });
  it("returns a compatible available alternative with an explanation", async () => {
    const answer = await reply("Есть EKT-CB-20A?");
    expect(answer.alternatives?.map((p) => p.sku)).toEqual(["EKT-CB-20A-PRO"]);
    expect(answer.alternativeReasons?.["EKT-CB-20A-PRO"]).toContain("ratedCurrent — 20 A");
  });
  it("finds alternatives for an out-of-stock purchase request too", async () => {
    expect((await reply("Добавь 2 EKT-CB-20A")).alternatives?.[0].sku).toBe("EKT-CB-20A-PRO");
  });
  it("answers all purchase conditions in a compound query", async () => {
    const answer = await reply("Оплата, доставка и минимальная партия?");
    expect(answer.message).toContain("банковская карта");
    expect(answer.message).toContain("самовывоз");
    expect(answer.message).toContain("кратно 5");
  });
  it("requires explicit confirmation and returns the same-session cart URL", async () => {
    expect((await reply("Добавь 2 EKT-CB-16A")).cart).toEqual([]);
    expect((await reply("okay")).cart).toEqual([]);
    await reply("Добавь 2 EKT-CB-16A");
    const added = await reply("да, добавь");
    expect(added.cart?.[0].quantity).toBe(2);
    expect(added.cartUrl).toBe("/cart");
    expect(added.cartUrl).not.toContain("session");
  });
  it("checks accumulated quantities against stock", async () => {
    await reply("Add 30 EKT-CB-16A"); await reply("yes, add it");
    expect((await reply("Добавь 6 EKT-CB-16A")).awaitingConfirmation).toBeUndefined();
    await reply("да, добавь");
    expect(getSession("one").cart[0].quantity).toBe(30);
  });
  it("distinguishes the base SKU from its longer variant", async () => {
    expect(findDemoProduct("Покажи EKT-CB-20A-PRO")?.sku).toBe("EKT-CB-20A-PRO");
    expect(findDemoProduct("Покажи EKT-CB-20A-UNKNOWN")).toBeUndefined();
    expect(searchProducts("EKT-CB-20A-UNKNOWN")).toEqual([]);
  });
  it("supports natural-language lookup and session follow-ups", async () => {
    expect((await reply("Нужен автомат 16А")).product?.sku).toBe("EKT-CB-16A");
    expect((await reply("Добавь его 3 шт")).awaitingConfirmation).toBe(true);
    expect((await reply("да, добавь")).cart?.[0].quantity).toBe(3);
  });
  it("does not suggest an electrically different substitute", () => {
    expect(suggestAlternatives(products[1]).some((p) => p.sku === "EKT-CB-16A")).toBe(false);
  });
  it("enforces pack sizes", async () => {
    expect((await reply("Добавь 3 EKT-CABLE-3X25")).awaitingConfirmation).toBeUndefined();
    expect((await reply("Добавь 10 EKT-CABLE-3X25")).awaitingConfirmation).toBe(true);
  });
});

describe("cart authority and concurrency", () => {
  beforeEach(() => { clearSessions(); vi.stubEnv("CATALOG_MODE", "demo"); });
  it.each(["Отмена", "не добавляй", "Нет, не надо", "don't add", "покажи EKT-RCD-25A", "Add 999 EKT-CB-16A"])("invalidates the pending operation after %s", async (text) => {
    await reply("Add 2 EKT-CB-16A"); await reply(text); await reply("да, добавь");
    expect(getSession("one").cart).toEqual([]);
  });
  it("rejects stale confirmation buttons", async () => {
    const first = await reply("Add 2 EKT-CB-16A");
    await reply("Add 1 EKT-RCD-25A");
    const result = await replyToMessage("да, добавь", "one", undefined, { confirmationId: first.confirmationId });
    expect(result.cart).toEqual([]);
  });
  it("applies simultaneous confirmation attempts only once", async () => {
    const product = { ...sample, source: "live" as const, availabilityVerified: true };
    const slow: Lookup = async () => { await new Promise((r) => setTimeout(r, 10)); return (await liveLookup(product)("")); };
    await replyToMessage("Add 2 EKT-CB-16A", "one", slow);
    await Promise.all([replyToMessage("да, добавь", "one", slow), replyToMessage("да, добавь", "one", slow)]);
    expect(getSession("one").cart[0].quantity).toBe(2);
  });
  it("expires confirmations", async () => {
    await reply("Add 2 EKT-CB-16A"); getSession("one").pendingCartChange!.expiresAt = 0;
    expect((await reply("да, добавь")).cart).toEqual([]);
  });
  it("rejects a changed live stock count", async () => {
    const product = { ...sample, source: "live" as const, availabilityVerified: true };
    await replyToMessage("Add 2 EKT-CB-16A", "one", liveLookup(product));
    const result = await replyToMessage("да, добавь", "one", liveLookup({ ...product, stockByWarehouse: { Алматы: 1 } }));
    expect(result.cart).toEqual([]); expect(result.message).toContain("изменились");
  });
  it("asks again if the price changes", async () => {
    const product = { ...sample, source: "live" as const, availabilityVerified: true };
    await replyToMessage("Add 2 EKT-CB-16A", "one", liveLookup(product));
    const changed = { ...product, price: 2800 };
    const result = await replyToMessage("да, добавь", "one", liveLookup(changed));
    expect(result.cart).toEqual([]); expect(result.awaitingConfirmation).toBe(true);
    expect((await replyToMessage("да, добавь", "one", liveLookup(changed))).cart?.[0].unitPrice).toBe(2800);
  });
  it("does not silently switch a live order to demo data", async () => {
    await replyToMessage("Add 2 EKT-CB-16A", "one", liveLookup({ ...sample, source: "live", availabilityVerified: true }));
    expect((await reply("да, добавь")).cart).toEqual([]);
  });
  it("treats read-only text as data, never confirmation", async () => {
    await reply("Add 2 EKT-CB-16A");
    const result = await replyToMessage("да, добавь", "one", undefined, { readOnly: true, skipLanguage: true });
    expect(result.cart).toEqual([]);
  });
  it("does not interpret a numeric SKU as quantity", () => {
    const numeric = { ...sample, sku: "200300285_" };
    expect(parseQuantity("Add 2 200300285_", numeric)).toBe(2);
    expect(parseQuantity("Add 200300285_", numeric)).toBe(1);
  });
  it.each(["0", "-2", "1.5", "1,5", "99999999999999999999"])("rejects invalid quantity %s", (quantity) => {
    expect(parseQuantity(`Добавь ${quantity} EKT-CB-16A`, sample)).toBeUndefined();
  });
  it("keeps separate sessions isolated", async () => {
    await reply("Add 2 EKT-CB-16A", "a");
    expect((await reply("да, добавь", "b")).cart).toEqual([]);
    expect((await reply("да, добавь", "a")).cart?.[0].quantity).toBe(2);
  });
});
