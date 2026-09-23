import { describe, expect, it, vi } from "vitest";
import { lookupMentionedProduct } from "@/lib/catalog";
import { fetchProductDetail, fetchProductPage, mapEktProduct } from "@/lib/ekt-api";

const authOptions = {
  baseUrl: "https://ekt.kz/api",
  username: "test-user",
  password: "test-password",
};

describe("EKT partner catalog adapter", () => {
  it("maps article, properties, certificates, price, and store stock from detail data", () => {
    const product = mapEktProduct({
      id: 515291,
      article: "200300285_",
      name: "Breaker DRX250",
      description: "Circuit breaker",
      price: 64920,
      quantity: 23,
      stores: [{ name: "Almaty", quantity: 8 }, { name: "Astana", quantity: "15" }],
      certificate_url: "https://ekt.kz/certificate.pdf",
      properties: { KOLICHESTVO_POLYUSOV: "3", NOMINALNYY_TOK: "250 A", CML2_ARTICLE: "ignored duplicate" },
      url: "https://ekt.kz/catalog/product/",
    }, "live");

    expect(product).toMatchObject({
      sku: "200300285_",
      apiId: "515291",
      category: "Uncategorized",
      price: 64920,
      stockByWarehouse: { Almaty: 8, Astana: 15 },
      availability: "available",
      availabilityVerified: true,
      specifications: { KOLICHESTVO_POLYUSOV: "3", NOMINALNYY_TOK: "250 A" },
      certificateUrl: "https://ekt.kz/certificate.pdf",
      source: "live",
    });
    expect(product.specifications.CML2_ARTICLE).toBeUndefined();
    expect(product.specifications.NOMINALNYY_TOK).toBe("250 A");
  });

  it("handles absent fields without inventing verified stock", () => {
    const product = mapEktProduct({ id: 1, article: "A-1", name: "Sample" }, "live");
    expect(product.category).toBe("Uncategorized");
    expect(product.price).toBeUndefined();
    expect(product.stockByWarehouse).toEqual({});
    expect(product.availability).toBe("unknown");
    expect(product.availabilityVerified).toBe(false);
    expect(product.certificateUrl).toBeUndefined();
  });

  it("validates paginated response metadata", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ page: 1, per_page: 20, count: 1, items: [{}] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    await expect(fetchProductPage(1, { ...authOptions, fetchImpl })).resolves.toMatchObject({ page: 1, perPage: 20, count: 1 });
    await expect(fetchProductPage(2, {
      ...authOptions,
      fetchImpl: async () => new Response(JSON.stringify({ items: [] }), { status: 200 }),
    })).rejects.toThrow("invalid pagination metadata");
  });

  it("rejects a detail response without product identity fields", async () => {
    await expect(fetchProductDetail(515291, {
      ...authOptions,
      fetchImpl: async () => new Response(JSON.stringify({ quantity: 0 }), { status: 200 }),
    })).rejects.toThrow("invalid shape");
  });

  it("follows pages and fetches detail when a listed article matches", async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      expect(new Headers(init?.headers).get("authorization")).toMatch(/^Basic /);
      if (url.includes("page=1")) {
        return new Response(JSON.stringify({ page: 1, per_page: 1, count: 1, items: [{ id: 10, article: "OTHER", name: "Other" }] }), { status: 200 });
      }
      if (url.includes("page=2")) {
        return new Response(JSON.stringify({ page: 2, per_page: 1, count: 1, items: [{ id: 515291, article: "200300285_", name: "Breaker DRX250" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 515291, article: "200300285_", name: "Breaker DRX250", price: 64920, quantity: 23, stores: [{ name: "Almaty", quantity: 23 }] }), { status: 200 });
    });

    const result = await lookupMentionedProduct("Show 200300285_", { ...authOptions, fetchImpl });
    expect(result).toMatchObject({ source: "live", complete: true, availabilityVerified: true, product: { apiId: "515291", sku: "200300285_", price: 64920 } });
    expect(calls).toHaveLength(3);
    expect(calls[2]).toContain("products/detail?id=515291");
  });

  it("uses labeled demo fallback on API errors and never marks its stock verified", async () => {
    const result = await lookupMentionedProduct("Show EKT-CB-16A", {
      ...authOptions,
      fetchImpl: async () => { throw new Error("offline"); },
    });
    expect(result).toMatchObject({ source: "demo", availabilityVerified: false, complete: false, product: { sku: "EKT-CB-16A", source: "demo" } });
  });

  it("does not use demo stock for an unrecognized product when the API is unavailable", async () => {
    const result = await lookupMentionedProduct("Show UNKNOWN-123", {
      ...authOptions,
      fetchImpl: async () => { throw new Error("offline"); },
    });
    expect(result).toMatchObject({ source: "unavailable", availabilityVerified: false, complete: false });
    expect(result.product).toBeUndefined();
  });
});
