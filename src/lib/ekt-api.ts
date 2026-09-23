import type { Product } from "@/lib/types";

type JsonRecord = Record<string, unknown>;

export type ProductPage = {
  page: number;
  perPage: number;
  count: number;
  items: JsonRecord[];
};

export class EktApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EktApiError";
  }
}

export type EktApiOptions = {
  baseUrl?: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function record(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : undefined;
}

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function number(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim().replace(",", "."));
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function firstText(source: JsonRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = text(source[key]);
    if (value) return value;
  }
  return undefined;
}

function firstNumber(source: JsonRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = number(source[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function apiConfig(options: EktApiOptions) {
  const baseUrl = options.baseUrl ?? process.env.EKT_API_BASE_URL ?? "https://ekt.kz/api";
  const username = options.username ?? process.env.EKT_API_USERNAME;
  const password = options.password ?? process.env.EKT_API_PASSWORD;
  if (!username || !password) throw new EktApiError("EKT API credentials are not configured.");
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new EktApiError("EKT_API_BASE_URL is not a valid URL.");
  }
  if (parsed.username || parsed.password) throw new EktApiError("EKT_API_BASE_URL must not contain credentials.");
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) {
    throw new EktApiError("EKT API requires HTTPS (except local development).");
  }
  return { baseUrl: `${baseUrl.replace(/\/+$/, "")}/`, username, password };
}

async function requestJson(url: URL, options: EktApiOptions): Promise<unknown> {
  const config = apiConfig(options);
  const fetchImpl = options.fetchImpl ?? fetch;
  const authorization = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: "application/json", Authorization: authorization },
      signal: AbortSignal.timeout(options.timeoutMs ?? 8000),
      cache: "no-store",
      redirect: "error",
    });
  } catch {
    throw new EktApiError("EKT API request failed or timed out.");
  }
  if (!response.ok) throw new EktApiError(`EKT API returned HTTP ${response.status}.`);
  try {
    return await response.json();
  } catch {
    throw new EktApiError("EKT API returned invalid JSON.");
  }
}

function parsePage(payload: unknown, requestedPage: number): ProductPage {
  const root = record(payload);
  if (!root || !Array.isArray(root.items)) throw new EktApiError("EKT product page has an invalid shape.");
  const page = number(root.page);
  const perPage = number(root.per_page ?? root.perPage);
  const count = number(root.count);
  if (page === undefined || perPage === undefined || count === undefined || page < 1 || perPage < 1 || count < 0) {
    throw new EktApiError("EKT product page has invalid pagination metadata.");
  }
  if (page !== requestedPage) throw new EktApiError("EKT product page number did not match the request.");
  const items = root.items.map(record);
  if (items.some((item) => !item)) throw new EktApiError("EKT product page contains an invalid item.");
  return { page, perPage, count, items: items as JsonRecord[] };
}

export async function fetchProductPage(page: number, options: EktApiOptions = {}): Promise<ProductPage> {
  const config = apiConfig(options);
  const url = new URL("products", config.baseUrl);
  url.searchParams.set("page", String(page));
  return parsePage(await requestJson(url, { ...options, ...config }), page);
}

export async function fetchProductDetail(id: string | number, options: EktApiOptions = {}): Promise<Product> {
  const config = apiConfig(options);
  const url = new URL("products/detail", config.baseUrl);
  url.searchParams.set("id", String(id));
  const payload = await requestJson(url, { ...options, ...config });
  const detail = record(payload);
  if (!detail || !firstText(detail, ["id", "product_id", "productId", "article", "sku", "name", "title"])) {
    throw new EktApiError("EKT product detail has an invalid shape.");
  }
  return mapEktProduct(detail, "live");
}

const nonSpecificationProperties = new Set([
  "BRAND_PRIORITY", "CML2_ARTICLE", "NOVINKA", "SPETSPREDLOZHENIE", "RECOMMEND",
  "CML2_BAR_CODE", "CML2_TRAITS", "CML2_TAXES", "KRATNOST_MIN", "IMYAKARTINKI",
  "ARTIKULPOSTAVSHCHIKA",
]);

function mapSpecifications(value: unknown): Record<string, string> {
  const properties = record(value);
  if (!properties) return {};
  return Object.fromEntries(Object.entries(properties)
    .filter(([key, item]) => !nonSpecificationProperties.has(key) && (typeof item === "string" || typeof item === "number" || typeof item === "boolean"))
    .map(([key, item]) => [key, String(item).trim()])
    .filter(([, item]) => item.length > 0));
}

function getCertificateUrl(source: JsonRecord): string | undefined {
  const direct = firstText(source, ["certificateUrl", "certificate_url", "certificate", "cert_url", "certificateLink"]);
  if (direct && /^https?:\/\//i.test(direct)) return direct;
  for (const key of ["certificates", "files", "documents"]) {
    const values = source[key];
    if (!Array.isArray(values)) continue;
    for (const value of values) {
      const item = record(value);
      if (!item) continue;
      const title = firstText(item, ["name", "title", "type", "label"])?.toLowerCase() ?? "";
      const url = firstText(item, ["url", "href", "link", "file", "src"]);
      if (url && /^https?:\/\//i.test(url) && (!title || /cert|сертифик|декларац/i.test(title))) return url;
    }
  }
  return undefined;
}

function parseStores(value: unknown): { stock: Record<string, number>; valid: boolean } {
  if (!Array.isArray(value)) return { stock: {}, valid: false };
  const stock: Record<string, number> = {};
  let valid = value.length > 0;
  for (const valueEntry of value) {
    const store = record(valueEntry);
    const name = store && firstText(store, ["name", "title", "warehouse", "store"]);
    const quantity = store && firstNumber(store, ["quantity", "stock", "available"]);
    if (!name || quantity === undefined || quantity < 0) {
      valid = false;
      continue;
    }
    stock[name] = (stock[name] ?? 0) + quantity;
  }
  return { stock, valid };
}

function mapAvailability(source: JsonRecord, stock: Record<string, number>, storesValid: boolean) {
  const quantity = firstNumber(source, ["quantity", "stock", "available_quantity", "availableQuantity"]);
  const explicit = source.availability ?? source.available ?? source.in_stock ?? source.inStock ?? source.stock_status ?? source.stockStatus;
  if (quantity !== undefined && quantity >= 0) {
    if (Object.keys(stock).length && (!storesValid || Object.values(stock).reduce((sum, value) => sum + value, 0) !== quantity)) {
      for (const key of Object.keys(stock)) delete stock[key];
      return { availability: "unknown" as const, availabilityVerified: false };
    }
    if (!Object.keys(stock).length) stock["All warehouses"] = quantity;
    return { availability: quantity > 0 ? "available" as const : "unavailable" as const, availabilityVerified: true };
  }
  if (storesValid) {
    const total = Object.values(stock).reduce((sum, value) => sum + value, 0);
    return { availability: total > 0 ? "available" as const : "unavailable" as const, availabilityVerified: true };
  }
  // A partial warehouse list is not a verified total, even if in_stock is true.
  for (const key of Object.keys(stock)) delete stock[key];
  if (typeof explicit === "boolean") {
    return { availability: explicit ? "available" as const : "unavailable" as const, availabilityVerified: true };
  }
  if (typeof explicit === "string") {
    const normalized = explicit.toLowerCase();
    if (["available", "in stock", "true", "да", "есть"].includes(normalized)) return { availability: "available" as const, availabilityVerified: true };
    if (["unavailable", "out of stock", "false", "нет"].includes(normalized)) return { availability: "unavailable" as const, availabilityVerified: true };
  }
  return { availability: "unknown" as const, availabilityVerified: false };
}

export function mapEktProduct(source: JsonRecord, origin: Product["source"]): Product {
  const apiId = firstText(source, ["id", "product_id", "productId"]);
  const sku = firstText(source, ["article", "sku", "code", "CML2_ARTICLE"]) ?? apiId ?? "Unknown SKU";
  const name = firstText(source, ["name", "title", "product_name"]) ?? sku;
  const stores = parseStores(source.stores ?? source.stockByWarehouse ?? source.warehouses);
  const stock = stores.stock;
  const availability = mapAvailability(source, stock, stores.valid);
  const price = firstNumber(source, ["price", "sale_price", "cost"]);
  const packSize = firstNumber(source, ["packSize", "pack_size", "minimum_quantity"])
    ?? firstNumber(record(source.properties) ?? {}, ["KRATNOST_MIN"]);
  const product: Product = {
    sku,
    name,
    category: firstText(source, ["category", "category_name", "categoryName", "group", "group_name"]) ?? "Uncategorized",
    description: firstText(source, ["description", "detail", "short_description"]) ?? "",
    currency: "KZT",
    price: price !== undefined && price >= 0 ? price : undefined,
    packSize: packSize !== undefined && Number.isSafeInteger(packSize) && packSize > 0 ? packSize : 1,
    stockByWarehouse: stock,
    specifications: mapSpecifications(source.properties ?? source.specifications),
    certificateUrl: getCertificateUrl(source),
    imageUrl: firstText(source, ["image", "image_url", "imageUrl", "picture"]),
    productUrl: firstText(source, ["url", "product_url", "productUrl"]),
    apiId,
    source: origin,
    ...availability,
  };
  return product;
}

export function getPageSignature(page: ProductPage): string {
  return page.items.map((item) => firstText(item, ["id", "article", "sku"]) ?? "?").join("|");
}
