import { products as demoProducts } from "@/data/products";
import { EktApiError, fetchProductDetail, fetchProductPage, getPageSignature, mapEktProduct, type EktApiOptions } from "@/lib/ekt-api";
import type { Product } from "@/lib/types";

export type ProductLookup = { product?: Product; source: "live" | "demo" | "unavailable"; availabilityVerified: boolean; complete: boolean };
const knownLive = new Map<string, Product>();
export function totalStock(product: Product): number {
  return Object.values(product.stockByWarehouse).reduce((sum, count) => sum + count, 0);
}
export function usesLiveCatalog(): boolean { return process.env.CATALOG_MODE === "live"; }

export function mentionsSku(message: string, sku: string): boolean {
  const escaped = sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}_-])${escaped}(?![\\p{L}\\p{N}_-])`, "iu").test(message);
}
function matches(message: string, product: Product): boolean {
  return mentionsSku(message, product.sku) || message.toLowerCase().includes(product.name.toLowerCase());
}
export function findDemoProduct(message: string): Product | undefined {
  return demoProducts.find((product) => matches(message, product));
}

const aliases: [RegExp, string][] = [
  [/breaker|автомат|ажыратқыш/iu, "автоматические выключатели"],
  [/cable|кабел|провод|сым/iu, "кабель и провод"],
  [/residual|rcd|узо/iu, "устройства защитного отключения"],
  [/lamp|light|led|ламп|свет|жарық/iu, "освещение"],
  [/socket|розет/iu, "розетки и выключатели"],
];
export function searchProducts(message: string, pool: Product[] = usesLiveCatalog() ? [...knownLive.values()] : demoProducts): Product[] {
  const exact = pool.filter((p) => matches(message, p));
  if (exact.length) return exact;
  if (/EKT-[\w-]+/i.test(message)) return []; // Unknown articles must not become a similar SKU.
  const category = aliases.find(([pattern]) => pattern.test(message))?.[1];
  const query = message.toLowerCase().replace(/ё/g, "е");
  const amperage = query.match(/(\d+)\s*[аa](?![\p{L}])/iu)?.[1];
  const wattage = query.match(/(\d+)\s*(?:вт|w)(?![\p{L}])/iu)?.[1];
  const budget = query.match(/(?:до|under|below)\s*(\d+)/iu)?.[1];
  const terms = query.match(/[\p{L}\d]{3,}/gu)?.filter((word) => !/^(покажи|найди|нужен|нужны|ищу|есть|товар|show|find|please|нужна|cheap|дешевле|какой|наличии)$/.test(word)) ?? [];
  let result = pool.map((product) => {
    const haystack = `${product.name} ${product.category} ${Object.values(product.specifications).join(" ")}`.toLowerCase();
    const score = terms.filter((term) => haystack.includes(term)).length + (category === product.category.toLowerCase() ? 10 : 0);
    return { product, score };
  }).filter(({ product, score }) => score > 0
    && (!category || product.category.toLowerCase() === category)
    && (!amperage || product.specifications.ratedCurrent === `${amperage} A`)
    && (!wattage || product.specifications.power === `${wattage} W`)
    && (!budget || (product.price !== undefined && product.price <= Number(budget))))
    .sort((a, b) => b.score - a.score).map(({ product }) => product);
  if (/дешев|cheap|бюджет/iu.test(message)) result = result.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
  return result.slice(0, 5);
}

export async function lookupMentionedProduct(message: string, options: EktApiOptions = {}): Promise<ProductLookup> {
  const clean = message.trim();
  const explicitOptions = Object.keys(options).length > 0;
  if (!usesLiveCatalog() && !explicitOptions) {
    return { product: findDemoProduct(clean), source: "demo", availabilityVerified: false, complete: true };
  }
  const started = Date.now();
  const signatures = new Set<string>();
  try {
    const known = [...knownLive.values()].find((p) => matches(clean, p));
    if (!explicitOptions && known?.apiId) {
      const detailed = await fetchProductDetail(known.apiId, { timeoutMs: 3000 });
      knownLive.set(detailed.sku, detailed);
      return { product: detailed, source: "live", availabilityVerified: detailed.availabilityVerified, complete: true };
    }
    for (let pageNumber = 1; pageNumber <= 100; pageNumber++) {
      const remaining = 3500 - (Date.now() - started);
      if (remaining <= 0) break;
      const page = await fetchProductPage(pageNumber, { ...options, timeoutMs: Math.min(options.timeoutMs ?? remaining, remaining) });
      const signature = getPageSignature(page);
      if (!page.items.length || signatures.has(signature)) return { source: "live", availabilityVerified: false, complete: true };
      signatures.add(signature);
      for (const item of page.items) {
        const product = mapEktProduct(item, "live");
        if (!explicitOptions) {
          if (knownLive.size >= 5000) knownLive.delete(knownLive.keys().next().value!);
          knownLive.set(product.sku, product);
        }
        if (!matches(clean, product)) continue;
        const detailed = product.apiId ? await fetchProductDetail(product.apiId, { ...options,
          timeoutMs: Math.min(options.timeoutMs ?? 3000, Math.max(1, 3500 - (Date.now() - started))) }) : product;
        if (!explicitOptions) knownLive.set(detailed.sku, detailed);
        return { product: detailed, source: "live", availabilityVerified: detailed.availabilityVerified, complete: true };
      }
      if (page.items.length < page.perPage || page.count < page.perPage) return { source: "live", availabilityVerified: false, complete: true };
    }
  } catch { /* Fail closed for real SKUs; only explicitly named demo SKUs can fall back. */ }
  const fallback = findDemoProduct(clean);
  return { product: fallback, source: fallback ? "demo" : "unavailable", availabilityVerified: false, complete: false };
}
export async function getProductBySku(sku: string, options: EktApiOptions = {}): Promise<ProductLookup> {
  return lookupMentionedProduct(sku, options);
}
export function matchingSpecificationCount(a: Product, b: Product): number {
  return Object.entries(a.specifications).filter(([key, value]) => b.specifications[key] === value).length;
}
export function suggestAlternatives(source: Product, limit = 3): Product[] {
  const pool = source.source === "demo" ? demoProducts : [...knownLive.values()];
  const keys = Object.keys(source.specifications);
  // A different electrical rating is not automatically a safe substitute.
  return pool.filter((candidate) => candidate.sku !== source.sku && source.category !== "Uncategorized"
    && candidate.category === source.category && candidate.source === source.source
    && keys.length > 0 && keys.every((key) => candidate.specifications[key] === source.specifications[key])
    && totalStock(candidate) > 0 && (candidate.source === "demo" || candidate.availabilityVerified)).slice(0, limit);
}
export function isCatalogUnavailable(result: ProductLookup): boolean { return !result.complete || result.source === "unavailable"; }
export function catalogErrorMessage(error: unknown): string { return error instanceof EktApiError ? error.message : "Каталог недоступен."; }
