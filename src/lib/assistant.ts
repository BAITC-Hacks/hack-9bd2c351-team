import { purchaseTerms } from "@/data/products";
import { findMentionedProduct, matchingSpecificationCount, suggestAlternatives, totalStock } from "@/lib/catalog";
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
    : " No certificate is present in the demo data.";
  return `${product.name} (${product.sku}) costs ${formatMoney(product.price)}. Stock: ${totalStock(product)}. Specifications: ${specs}.${certificate}`;
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

function addToCart(cart: CartItem[], product: Product, quantity: number): void {
  const existing = cart.find((item) => item.sku === product.sku);
  if (existing) existing.quantity += quantity;
  else cart.push({ sku: product.sku, name: product.name, quantity, unitPrice: product.price });
}

export function replyToMessage(message: string, sessionId: string): AssistantResponse {
  const clean = message.trim();
  const normalized = clean.toLowerCase().replace(/[.!?]+$/g, "").trim();
  const session = getSession(sessionId);

  if (explicitConfirmations.has(normalized)) {
    const pending = session.pendingCartChange;
    if (!pending) return { message: "There is no pending cart change to confirm.", cart: session.cart };

    const product = findMentionedProduct(pending.sku);
    if (!product) {
      session.pendingCartChange = undefined;
      return { message: "That product is no longer available in the catalog.", cart: session.cart };
    }

    const alreadyInCart = session.cart.find((item) => item.sku === product.sku)?.quantity ?? 0;
    const available = totalStock(product) - alreadyInCart;
    if (pending.quantity > available) {
      session.pendingCartChange = undefined;
      return { message: `Stock changed. Only ${Math.max(0, available)} more unit(s) can be added. The cart was not changed.`, cart: session.cart };
    }

    addToCart(session.cart, product, pending.quantity);
    session.pendingCartChange = undefined;
    return {
      message: `${pending.quantity} × ${product.name} was added to the cart.`,
      cart: session.cart,
      cartUrl: `/cart?sessionId=${encodeURIComponent(sessionId)}`,
    };
  }

  const terms = getTermsAnswer(clean);
  if (terms) return { message: terms, cart: session.cart };

  const product = findMentionedProduct(clean);
  if (product && isAddIntent(clean)) {
    const quantity = parseQuantity(clean);
    const alreadyInCart = session.cart.find((item) => item.sku === product.sku)?.quantity ?? 0;
    const available = totalStock(product) - alreadyInCart;
    if (available <= 0) return { message: `${product.name} is not available to add.`, product, cart: session.cart };
    if (quantity > available) {
      return { message: `Requested quantity ${quantity} exceeds the ${available} unit(s) currently available to you. The cart was not changed.`, product, cart: session.cart };
    }

    session.pendingCartChange = { sku: product.sku, quantity };
    return {
      message: `Ready to add ${quantity} × ${product.name} at ${formatMoney(product.price)} each. Reply “yes, add it” to confirm.`,
      product,
      cart: session.cart,
      awaitingConfirmation: true,
    };
  }

  if (product) {
    if (totalStock(product) === 0) {
      const alternatives = suggestAlternatives(product);
      const reason = alternatives[0]
        ? ` The closest option matches ${matchingSpecificationCount(product, alternatives[0])} specification field(s) and is in stock.`
        : " No compatible in-stock alternative is present in the demo catalog.";
      return { message: `${describe(product)}${reason}`, product, alternatives, cart: session.cart };
    }
    return { message: describe(product), product, cart: session.cart };
  }

  return {
    message: "I can check products, stock, certificates, alternatives, payment, delivery, and minimum order terms. Try “Show EKT-CB-16A” or “Add 2 EKT-CB-16A”.",
    cart: session.cart,
  };
}

