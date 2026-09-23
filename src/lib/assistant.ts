import { purchaseTerms } from "@/data/products";
import { lookupMentionedProduct, mentionsSku, searchProducts, suggestAlternatives, totalStock, type ProductLookup } from "@/lib/catalog";
import { rewriteSearch } from "@/lib/language";
import { getSession, withSessionLock } from "@/lib/sessions";
import type { AssistantResponse, PendingCartChange, Product, SessionState } from "@/lib/types";

const confirmations = new Set(["yes add it", "yes, add it", "confirm add", "да добавь", "да, добавь", "подтверждаю добавление", "иә қос", "иә, қос"]);
const normalize = (text: string) => text.trim().toLowerCase().replace(/[.!]+$/g, "").trim();
const money = (value: number) => `${new Intl.NumberFormat("ru-KZ").format(value)} ₸`;
export type Lookup = (query: string) => Promise<ProductLookup>;
export type ReplyOptions = { confirmationId?: string; readOnly?: boolean; skipLanguage?: boolean };

export function containsPaymentData(text: string): boolean {
  return /(?:\d[ -]?){13,19}/.test(text) || /(?:cvv|cvc|номер карты|card number)\s*[:=]?\s*\d/i.test(text);
}
function isAddIntent(text: string): boolean { return /(?:^|[\s,])(add|buy|добав\p{L}*|куп\p{L}*|закаж\p{L}*|қос\p{L}*)(?=$|[\s,])/iu.test(text); }
function isCancel(text: string): boolean { return /(?:^|[\s,])(нет|отмен\p{L}*|не добав\p{L}*|не надо|не хочу|не покуп\p{L}*|cancel|no|don't add|do not add|жоқ)(?=$|[\s,.!?])/iu.test(text); }

export function parseQuantity(text: string, product: Product): number | undefined {
  const withoutIdentity = text.replace(/(?:товар|вариант|item|option)\s*\d+/giu, "").replaceAll(product.sku, "").replace(new RegExp(product.sku.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "").replace(product.name, "");
  const unit = withoutIdentity.match(/(-?\d+(?:[.,]\d+)?)\s*(?:шт\.?|штук\p{L}*|ед\.?|метр\p{L}*|м|units?|pcs|pieces?)(?=$|[\s,.!?])/iu);
  const afterVerb = withoutIdentity.match(/(?:add|buy|добав\p{L}*|куп\p{L}*|қос\p{L}*)\s+(-?\d+(?:[.,]\d+)?)(?=$|[\s,.!?])/iu);
  const standalone = withoutIdentity.match(/(?:^|\s)(-?\d+(?:[.,]\d+)?)(?=$|\s)/);
  const value = Number((unit?.[1] ?? afterVerb?.[1] ?? standalone?.[1] ?? "1").replace(",", "."));
  return Number.isSafeInteger(value) && value > 0 && value <= 100000 ? value : undefined;
}
function termsAnswer(text: string): string {
  const answers: string[] = [];
  if (/payment|pay|оплат|төлем/iu.test(text)) answers.push(purchaseTerms.payment);
  if (/delivery|deliver|достав|жеткіз|самовывоз/iu.test(text)) answers.push(purchaseTerms.delivery);
  if (/minimum|min order|минималь|партия|партии|кратност|ең аз/iu.test(text)) answers.push(purchaseTerms.minimumOrder);
  if (!answers.length && /условия покупки|условия заказа|purchase terms/iu.test(text)) answers.push(...Object.values(purchaseTerms));
  return answers.join("\n\n");
}
function describe(product: Product): string {
  const stock = product.source === "demo" ? `Демо-остаток: ${totalStock(product)}.`
    : product.availabilityVerified && Object.keys(product.stockByWarehouse).length ? `Остаток: ${totalStock(product)}.` : "Точный остаток не подтверждён.";
  const price = product.price === undefined ? "Цена не предоставлена." : `Цена: ${money(product.price)}.`;
  const specs = Object.entries(product.specifications).map(([key, value]) => `${key}: ${value}`).join("; ");
  return `${product.name} (${product.sku}). ${price} ${stock}\nХарактеристики: ${specs || "не предоставлены"}.\n${product.certificateUrl ? "Документ доступен в карточке товара." : "Сертификат в каталоге отсутствует."}${product.source === "demo" ? "\nСинтетические данные для демонстрации, не реальные цены и остатки ekt.kz." : ""}`;
}
function canPrepare(product: Product): boolean {
  return product.price !== undefined && Number.isFinite(product.price) && product.price >= 0
    && Object.keys(product.stockByWarehouse).length > 0 && (product.source === "demo" || product.availabilityVerified);
}
function proposal(session: SessionState, product: Product, quantity: number): AssistantResponse {
  const pending: PendingCartChange = { id: crypto.randomUUID(), sku: product.sku, quantity, unitPrice: product.price!,
    source: product.source, expiresAt: Date.now() + 5 * 60_000 };
  session.pendingCartChange = pending;
  return { message: `Добавить ${quantity} × ${product.name} по ${money(product.price!)}? Итого ${money(product.price! * quantity)}.\nПодтвердите кнопкой или напишите «да, добавь».${product.source === "demo" ? " Это демонстрационная корзина." : ""}`,
    product, awaitingConfirmation: true, confirmationId: pending.id };
}
function withAlternatives(product: Product): AssistantResponse {
  const alternatives = suggestAlternatives(product);
  return { message: describe(product) + (alternatives.length ? "\nНашёл доступный аналог с совпадающими характеристиками." : "\nПроверенного аналога в доступном каталоге нет. Уточните замену у менеджера."),
    product, alternatives, alternativeReasons: Object.fromEntries(alternatives.map((p) => [p.sku,
      `Совпадают: ${Object.entries(product.specifications).map(([key, value]) => `${key} — ${value}`).join(", ")}. ${p.source === "demo" ? "Демо-остаток" : "Остаток"}: ${totalStock(p)}.`])) };
}

async function respond(message: string, session: SessionState, lookup: Lookup, options: ReplyOptions): Promise<AssistantResponse> {
  const clean = message.trim();
  if (containsPaymentData(clean)) {
    session.pendingCartChange = undefined;
    return { message: "Не отправляйте платёжные данные в чат. Сообщение не сохранено. Для подбора товара укажите артикул или характеристики." };
  }
  if (isCancel(clean) && !options.readOnly) {
    session.pendingCartChange = undefined;
    return { message: "Добавление отменено. Корзина не изменена." };
  }
  if (!options.readOnly && (confirmations.has(normalize(clean)) || options.confirmationId)) {
    const pending = session.pendingCartChange;
    if (!pending || pending.expiresAt <= Date.now() || (options.confirmationId && options.confirmationId !== pending.id)) {
      session.pendingCartChange = undefined;
      return { message: "Нет актуального запроса для подтверждения. Выберите товар и количество заново." };
    }
    if (!confirmations.has(normalize(clean))) return { message: "Для добавления напишите «да, добавь»." };
    session.pendingCartChange = undefined; // Consume once; a failed check also requires a fresh request.
    const { product } = await lookup(pending.sku);
    if (!product || product.sku !== pending.sku || !canPrepare(product) || product.source !== pending.source) {
      return { message: "Не удалось подтвердить текущие цену, источник и остаток. Корзина не изменена." };
    }
    const existing = session.cart.find((item) => item.sku === product.sku);
    const available = totalStock(product) - (existing?.quantity ?? 0);
    if (pending.quantity > available || pending.quantity % (product.packSize ?? 1) !== 0) {
      return { message: `Остаток или кратность изменились. Можно добавить не более ${Math.max(0, available)}. Корзина не изменена.`, product };
    }
    if (product.price !== pending.unitPrice) {
      return { ...proposal(session, product, pending.quantity), message: `Цена изменилась. ${proposalText(product, pending.quantity)}` };
    }
    if (existing && (existing.source !== product.source || existing.unitPrice !== product.price)) {
      return { message: "У позиции в корзине изменилась цена или источник. Обратитесь к менеджеру; корзина не изменена." };
    }
    if (existing) existing.quantity += pending.quantity;
    else session.cart.push({ sku: product.sku, name: product.name, quantity: pending.quantity, unitPrice: product.price!, source: product.source });
    return { message: `Добавлено: ${pending.quantity} × ${product.name}. ${product.source === "demo" ? "Демонстрационная корзина; реальный заказ не создаётся." : "Откройте корзину для просмотра."}`, cartUrl: "/cart", product };
  }
  // Any new request supersedes the previous offer, including attachment analysis.
  session.pendingCartChange = undefined;
  if (/^(да|yes|confirm|ок|okay|ok|иә)[.!]?$/iu.test(clean)) return { message: "Корзина не изменена. Укажите товар и количество, затем подтвердите фразой «да, добавь»." };
  if (/^(корзина|покажи корзину|my cart|show cart)$/iu.test(clean)) return { message: "Текущее состояние корзины доступно по ссылке.", cartUrl: "/cart" };
  if (/менеджер|manager|человек/iu.test(clean)) return { message: "Контакты менеджера доступны на сайте ekt.kz. В прототипе обращение автоматически не отправляется.", suggestions: ["Условия покупки"] };
  if (/^(привет|здравствуйте|hello|hi|сәлем)[! .]*$/iu.test(clean)) return { message: "Здравствуйте! Помогу подобрать электротехнический товар, проверить характеристики и наличие. Укажите артикул или расскажите, что ищете.", suggestions: ["Автомат 16А", "Условия покупки"] };
  const terms = termsAnswer(clean);
  const adding = !options.readOnly && isAddIntent(clean);
  let found = await lookup(clean);
  let product = found.product;
  let results = product ? [product] : searchProducts(clean);
  const index = clean.match(/(?:товар|вариант|item|option)\s*(\d+)/iu)?.[1];
  if (!product && index) product = session.lastResults[Number(index) - 1];
  if (!product && !index && session.lastProduct && /(?:его|этот|него|этого|такой|it|this|сертификат|характеристики|аналог|дешевле)/iu.test(clean) && !/EKT-|\d{6,}_/iu.test(clean)) product = session.lastProduct;
  if (!product && adding && results.length === 0 && /^(?:add|buy|добав\p{L}*|куп\p{L}*)\s+\d+\s*(?:шт\.?|штук|pcs)?$/iu.test(clean)) product = session.lastProduct;
  if (!product && results.length === 1) product = results[0];
  if (!product && !results.length && !terms && !options.skipLanguage && !options.readOnly) {
    const rewritten = await rewriteSearch(clean, session.lastProduct);
    if (rewritten) {
      found = await lookup(rewritten);
      results = found.product ? [found.product] : searchProducts(rewritten);
      // An AI search suggestion still needs a user to select the product before purchase.
      if (!adding && results.length === 1) product = results[0];
    }
  }
  if (!product) {
    session.lastResults = results;
    if (results.length > 1) session.lastProduct = undefined;
    if (results.length) return { message: [terms, "Нашёл несколько позиций. Выберите артикул; для добавления укажите количество."].filter(Boolean).join("\n\n"), products: results };
    if (terms) return { message: terms };
    return { message: "По этому запросу товар не найден в доступной части каталога. Укажите артикул, тип товара или основные параметры. Например: «автомат 16А» или «кабель». При неполной загрузке live-каталога поиск может не охватывать все позиции.", suggestions: ["Автомат 16А", "Покажи EKT-CB-20A", "Условия покупки"] };
  }
  // Re-fetch selections from prior results before offering any cart operation.
  if (adding && product.source === "live" && found.product?.sku !== product.sku) {
    const selected = await lookup(product.sku);
    if (!selected.product || selected.product.sku !== product.sku) return { message: "Актуальные данные выбранного товара недоступны. Корзина не изменена." };
    product = selected.product;
  }
  session.lastProduct = product;
  session.lastResults = [product];
  if (adding) {
    const quantity = parseQuantity(clean, product);
    if (quantity === undefined) return { message: "Укажите положительное целое количество. Корзина не изменена.", product };
    if (!canPrepare(product)) return { message: "Точные цена или остаток не подтверждены. Добавление недоступно.", product };
    if (quantity % (product.packSize ?? 1) !== 0) return { message: `Количество должно быть кратно ${product.packSize}. Корзина не изменена.`, product };
    const available = totalStock(product) - (session.cart.find((item) => item.sku === product.sku)?.quantity ?? 0);
    if (available <= 0) return withAlternatives(product);
    if (quantity > available) return { message: `Запрошено ${quantity}, доступно для добавления ${available}. Корзина не изменена.`, product };
    return proposal(session, product, quantity);
  }
  const answer = product.availability === "unavailable" || /аналог|alternative|дешевле/iu.test(clean) ? withAlternatives(product) : { message: describe(product), product };
  return { ...answer, message: [terms, answer.message].filter(Boolean).join("\n\n"), suggestions: [`Добавь 1 ${product.sku}`, "Условия покупки"] };
}
function proposalText(product: Product, quantity: number): string {
  return `Добавить ${quantity} × ${product.name} по ${money(product.price!)}? Итого ${money(product.price! * quantity)}. Подтвердите повторно: «да, добавь».`;
}
export async function replyToMessage(message: string, sessionId: string, lookup: Lookup = lookupMentionedProduct, options: ReplyOptions = {}): Promise<AssistantResponse> {
  return withSessionLock(sessionId, async () => {
    const session = getSession(sessionId);
    const response = await respond(message, session, lookup, options);
    return structuredClone({ ...response, cart: session.cart, catalogSource: response.product?.source,
      availabilityVerified: response.product?.availabilityVerified });
  });
}
