import { products } from "@/data/products";
import type { Product } from "@/lib/types";

export function totalStock(product: Product): number {
  return Object.values(product.stockByWarehouse).reduce((sum, count) => sum + count, 0);
}

export function findMentionedProduct(message: string): Product | undefined {
  const normalized = message.toLowerCase();
  return products.find(
    (product) => normalized.includes(product.sku.toLowerCase()) || normalized.includes(product.name.toLowerCase()),
  );
}

export function suggestAlternatives(source: Product, limit = 3): Product[] {
  return products
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

