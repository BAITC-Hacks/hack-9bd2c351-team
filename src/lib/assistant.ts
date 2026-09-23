import { purchaseTerms } from "@/data/products";
import { lookupMentionedProduct, matchingSpecificationCount, suggestAlternatives, totalStock, type ProductLookup } from "@/lib/catalog";
import { getSession } from "@/lib/sessions";
import type { AssistantResponse, CartItem, Product } from "@/lib/types";

const explicitConfirmations = new Set([
  "yes", "yes add it", "yes, add it", "confirm", "да", "да добавь", "да, добавь", "иә", "иә қос",
]);

function formatMoney(value: number): string {
  return `${new Intl.NumberFormat("en-US").format(value)} KZT`;
}

function describe(product: Product): string {
  const specs = Object.entries(product.specifications).map(([key, value]) => `${key}: ${value}`).join(", ");
  const certificate = product.certificateUrl
    ? ` Certificate: ${product.certificateUrl}`
    : " No certificate URL was provided by the catalog data.";
  const price = product.price === undefined ? "Price is not available." : `Price: ${formatMoney(product.price)}.`;
  const stock = product.availabilityVerified && Object.keys(product.stockByWarehouse).length > 0
    ? `Stock: ${totalStock(product)}.`
    : product.availabilityVerified && product.availability === "available"
      ? "Availability: in stock; quantity was not provided."
      : product.availabilityVerified
        ? "Availability: out of stock."
    : product.source === "demo"
      ? `Demo stock: ${totalStock(product)}; live availability could not be verified.`
      : "Live availability could not be verified.";
  const source = product.source === "demo" ? " Demo fallback data." : "";
  return `${product.name} (${product.sku}). ${price} ${stock} Specifications: ${specs || "not provided"}.${certificate}${source}`;
}

function parseQuantity(message: string): number {
  const withoutSku = message.replace(/EKT-[A-Z0-9-]+/gi, "");
  const match = withoutSku.match(/\b(\d+)\b/);
  return match ? Math.max(1, Number(match[1])) : 1;
}

function isAddIntent(message: string): boolean {
  return /\b(add|buy|cart|добав|куп|себет|қос)\b/i.test(message);
}

function getTermsAnswer(message: string): string | undefined {
  if (/payment|pay|оплат|төлем/i.test(message)) return purchaseTerms.payment;
  if (/delivery|deliver|достав|жеткіз/i.test(message)) return purchaseTerms.delivery;
  if (/minimum|min order|минималь|ең аз/i.test(message)) return purchaseTerms.minimumOrder;
  return undefined;
}

function isCatalogQuestion(message: string): boolean {
  return isAddIntent(message)
    || /\b[\p{L}0-9][\p{L}0-9_/-]*\d[\p{L}0-9_/-]*\b/iu.test(message)
    || /product|catalog|stock|available|certificate|certification|specification|price|sku|article|show|find|search|looking for|do you have|how many|товар|налич|сертифик|характерист|артикул|покажи|найди|ищу|есть ли/i.test(message);
}

function addToCart(cart: CartItem[], product: Product, quantity: number): void {
  if (product.price === undefined) return;
  const existing = cart.find((item) => item.sku === product.sku);
  if (existing) existing.quantity += quantity;
  else cart.push({ sku: product.sku, name: product.name, quantity, unitPrice: product.price });
}

export async function replyToMessage(
  message: string,
  sessionId: string,
  lookupProduct: (query: string) => Promise<ProductLookup> = lookupMentionedProduct,
): Promise<AssistantResponse> {
  const clean = message.trim();
  const normalized = clean.toLowerCase().replace(/[.!?]+$/g, "").trim();
  const session = getSession(sessionId);

  if (explicitConfirmations.has(normalized)) {
    const pending = session.pendingCartChange;
    if (!pending) return { message: "There is no pending cart change to confirm.", cart: session.cart };

    const lookup = await lookupProduct(pending.sku);
    const product = lookup.product;
    if (!product) {
      session.pendingCartChange = undefined;
      return { message: "That product could not be verified in the catalog. The cart was not changed.", cart: session.cart, catalogSource: lookup.source, availabilityVerified: false };
    }

    const alreadyInCart = session.cart.find((item) => item.sku === product.sku)?.quantity ?? 0;
    if (product.price === undefined || (product.source === "live" && !product.availabilityVerified)) {
      session.pendingCartChange = undefined;
      return { message: "Current price or stock could not be verified. The cart was not changed.", cart: session.cart, product, catalogSource: lookup.source, availabilityVerified: false };
    }
    const available = totalStock(product) - alreadyInCart;
    if (pending.quantity > available) {
      session.pendingCartChange = undefined;
      return { message: `Stock changed. Only ${Math.max(0, available)} more unit(s) can be added. The cart was not changed.`, cart: session.cart, product, catalogSource: lookup.source, availabilityVerified: product.availabilityVerified };
    }

    addToCart(session.cart, product, pending.quantity);
    session.pendingCartChange = undefined;
    return {
      message: `${pending.quantity} × ${product.name} was added to the cart.${product.source === "demo" ? " This used demo data; live stock could not be verified." : ""}`,
      cart: session.cart,
      cartUrl: `/cart?sessionId=${encodeURIComponent(sessionId)}`,
      product,
      catalogSource: lookup.source,
      availabilityVerified: product.availabilityVerified,
    };
  }

  const terms = getTermsAnswer(clean);
  if (terms) return { message: terms, cart: session.cart };

  if (!isCatalogQuestion(clean)) {
    return {
      message: "I can look up a product by name or article, check stock and certificates, or answer payment, delivery, and minimum-order questions.",
      cart: session.cart,
    };
  }

  const lookup = await lookupProduct(clean);
  const product = lookup.product;
  if (!product) {
    if (lookup.source === "live") {
      return { message: "I couldn't find that product in the live catalog.", cart: session.cart, catalogSource: "live", availabilityVerified: false };
    }
    return {
      message: "I can't verify live catalog availability right now. Demo fallback data is available for sample SKUs such as EKT-CB-16A.",
      cart: session.cart,
      catalogSource: "unavailable",
      availabilityVerified: false,
    };
  }

  if (product && isAddIntent(clean)) {
    const quantity = parseQuantity(clean);
    const alreadyInCart = session.cart.find((item) => item.sku === product.sku)?.quantity ?? 0;
    if (product.price === undefined || (product.source === "live" && !product.availabilityVerified)) {
      return { message: `I can't verify the current price or stock for ${product.name}, so I can't prepare a cart change.`, product, cart: session.cart, catalogSource: lookup.source, availabilityVerified: false };
    }
    const available = totalStock(product) - alreadyInCart;
    if (available <= 0) return { message: `${product.name} is not available to add.${product.source === "demo" ? " This is demo fallback data; live availability could not be verified." : ""}`, product, cart: session.cart, catalogSource: lookup.source, availabilityVerified: product.availabilityVerified };
    if (quantity > available) {
      return { message: `Requested quantity ${quantity} exceeds the ${available} unit(s) currently available to you. The cart was not changed.`, product, cart: session.cart, catalogSource: lookup.source, availabilityVerified: product.availabilityVerified };
    }

    session.pendingCartChange = { sku: product.sku, quantity };
    return {
      message: `Ready to add ${quantity} × ${product.name} at ${formatMoney(product.price)} each. Reply “yes, add it” to confirm.${product.source === "demo" ? " This is demo data; live stock is unverified." : ""}`,
      product,
      cart: session.cart,
      awaitingConfirmation: true,
      catalogSource: lookup.source,
      availabilityVerified: product.availabilityVerified,
    };
  }

  if (product) {
    if (!product.availabilityVerified && product.source === "live") {
      return { message: `${describe(product)} Live availability is unverified.`, product, cart: session.cart, catalogSource: lookup.source, availabilityVerified: false };
    }
    if (product.availability === "unavailable") {
      const alternatives = suggestAlternatives(product);
      const reason = alternatives[0]
        ? ` The closest demo option matches ${matchingSpecificationCount(product, alternatives[0])} specification field(s); its live availability is unverified.`
        : " No compatible in-stock alternative is present in the demo catalog.";
      return { message: `${describe(product)}${reason}`, product, alternatives, cart: session.cart, catalogSource: lookup.source, availabilityVerified: product.availabilityVerified };
    }
    return { message: describe(product), product, cart: session.cart, catalogSource: lookup.source, availabilityVerified: product.availabilityVerified };
  }

  return { message: "Ask me about a product, certificate, payment, delivery, or minimum-order terms.", cart: session.cart };
}
