import { products as demoProducts } from "@/data/products";
import { EktApiError, fetchProductDetail, fetchProductPage, getPageSignature, mapEktProduct, type EktApiOptions } from "@/lib/ekt-api";
import type { Product } from "@/lib/types";

const maxPagesPerLookup = 100;
const lookupBudgetMs = 9000;

export type ProductLookup = {
  product?: Product;
  source: "live" | "demo" | "unavailable";
  availabilityVerified: boolean;
  complete: boolean;
};

export function totalStock(product: Product): number {
  return Object.values(product.stockByWarehouse).reduce((sum, count) => sum + count, 0);
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function matchProduct(message: string, product: Product): boolean {
  const query = normalize(message);
  return query.includes(normalize(product.sku)) || query.includes(normalize(product.name));
}

function findDemoProduct(message: string): Product | undefined {
  return demoProducts.find((product) => matchProduct(message, product));
}

export async function lookupMentionedProduct(message: string, options: EktApiOptions = {}): Promise<ProductLookup> {
  const cleanMessage = message.trim();
  if (!cleanMessage) return { source: "live", availabilityVerified: false, complete: true };

  const startedAt = Date.now();
  const signatures = new Set<string>();
  const itemsSeen = new Set<string>();
  let reachedLimit = true;

  try {
    for (let pageNumber = 1; pageNumber <= maxPagesPerLookup; pageNumber += 1) {
      const remaining = lookupBudgetMs - (Date.now() - startedAt);
      if (remaining <= 0) break;
      const page = await fetchProductPage(pageNumber, { ...options, timeoutMs: Math.min(options.timeoutMs ?? remaining, remaining) });
      const signature = getPageSignature(page);
      if (!page.items.length || signatures.has(signature)) {
        reachedLimit = false;
        break;
      }
      signatures.add(signature);

      for (const item of page.items) {
        const product = mapEktProduct(item, "live");
        const key = product.apiId ?? product.sku;
        if (itemsSeen.has(key)) continue;
        itemsSeen.add(key);
        if (!matchProduct(cleanMessage, product)) continue;
        if (!product.apiId) return { product, source: "live", availabilityVerified: false, complete: true };
        const detailed = await fetchProductDetail(product.apiId, { ...options, timeoutMs: Math.min(options.timeoutMs ?? 5000, Math.max(1, lookupBudgetMs - (Date.now() - startedAt))) });
        return { product: detailed, source: "live", availabilityVerified: detailed.availabilityVerified, complete: true };
      }

      if (page.items.length < page.perPage || page.count < page.perPage) {
        reachedLimit = false;
        break;
      }
      if (Date.now() - startedAt >= lookupBudgetMs) break;
    }

    if (reachedLimit) {
      const fallback = findDemoProduct(cleanMessage);
      return fallback
        ? { product: fallback, source: "demo", availabilityVerified: false, complete: false }
        : { source: "unavailable", availabilityVerified: false, complete: false };
    }
    return { source: "live", availabilityVerified: false, complete: true };
  } catch (error) {
    const fallback = findDemoProduct(cleanMessage);
    if (fallback) return { product: fallback, source: "demo", availabilityVerified: false, complete: false };
    return { source: "unavailable", availabilityVerified: false, complete: false };
  }
}

export async function getProductBySku(sku: string, options: EktApiOptions = {}): Promise<ProductLookup> {
  return lookupMentionedProduct(sku, options);
}

export function suggestAlternatives(source: Product, limit = 3): Product[] {
  return demoProducts
    .filter((candidate) => candidate.sku !== source.sku && candidate.category === source.category && totalStock(candidate) > 0)
    .map((candidate) => ({
      candidate,
      score: Object.entries(source.specifications).reduce(
        (score, [key, value]) => score + (candidate.specifications[key] === value ? 1 : 0),
        0,
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}

export function matchingSpecificationCount(a: Product, b: Product): number {
  return Object.entries(a.specifications).filter(([key, value]) => b.specifications[key] === value).length;
}

export function isCatalogUnavailable(result: ProductLookup): boolean {
  return result.source === "unavailable" || result.source === "demo" || !result.complete;
}

export function catalogErrorMessage(error: unknown): string {
  return error instanceof EktApiError ? error.message : "The catalog could not be reached.";
}
