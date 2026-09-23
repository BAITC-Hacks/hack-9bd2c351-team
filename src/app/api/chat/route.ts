import { containsPaymentData, replyToMessage } from "@/lib/assistant";
import { extractAttachment, MAX_FILE_BYTES } from "@/lib/attachments";
import { lookupMentionedProduct, searchProducts } from "@/lib/catalog";
import { getSession, withSessionLock } from "@/lib/sessions";
import { isSameOrigin, jsonResponse, readLimited, requestSession } from "@/lib/http";
import type { AssistantResponse } from "@/lib/types";
export const runtime = "nodejs";
const rates = new Map<string, { start: number; count: number }>();

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonResponse({ error: "Недопустимый источник запроса." }, undefined, 403);
  let id: string | undefined;
  try {
    id = requestSession(request);
    const now = Date.now();
    for (const [key, value] of rates) if (now - value.start > 60000) rates.delete(key);
    const rate = rates.get(id) ?? { start: now, count: 0 };
    rates.set(id, rate);
    if (++rate.count > 30) return jsonResponse({ error: "Слишком много сообщений. Подождите минуту." }, id, 429);
    let message = "", confirmationId: string | undefined, file: File | undefined;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.startsWith("multipart/form-data")) {
      const data = await readLimited(request, MAX_FILE_BYTES + 16384);
      const form = await new Response(new Uint8Array(data).buffer, { headers: { "content-type": contentType } }).formData();
      const uploads = form.getAll("file");
      if (uploads.length !== 1 || !(uploads[0] instanceof File)) return jsonResponse({ error: "Прикрепите один файл." }, id, 400);
      file = uploads[0];
      message = typeof form.get("message") === "string" ? String(form.get("message")) : "";
    } else {
      const raw = JSON.parse(new TextDecoder().decode(await readLimited(request, 16384)));
      if (typeof raw?.message !== "string") return jsonResponse({ error: "Введите сообщение." }, id, 400);
      message = raw.message;
      if (raw.confirmationId !== undefined && typeof raw.confirmationId !== "string") return jsonResponse({ error: "Некорректное подтверждение." }, id, 400);
      confirmationId = raw.confirmationId;
    }
    if ((!message.trim() && !file) || message.length > 2000) return jsonResponse({ error: "Введите от 1 до 2000 символов." }, id, 400);
    if (containsPaymentData(message)) return jsonResponse(await replyToMessage(message, id), id);
    let answer: AssistantResponse;
    if (file) {
      const text = await extractAttachment(file);
      // Attachments are evidence for retrieval, never instructions to execute.
      // Drop any long digit sequences; never retain raw files or extracted text in history.
      const safeText = text.replace(/(?:\d[ -]?){13,19}/g, "[redacted]");
      const queries = [...new Set(safeText.match(/EKT-[A-Z0-9-]+|\b\d{6,12}_\b/gi) ?? [])].slice(0, 8);
      const matched = queries.length ? (await Promise.all(queries.map((query) => lookupMentionedProduct(query)))).flatMap((r) => r.product ? [r.product] : []) : searchProducts(safeText);
      answer = await withSessionLock(id, async () => {
        const session = getSession(id!);
        session.pendingCartChange = undefined;
        session.lastResults = matched;
        session.lastProduct = matched.length === 1 ? matched[0] : undefined;
        return { message: matched.length ? `В документе найдены товары из каталога (${matched.length}). Количества из файла не применены. Выберите артикул и укажите количество в чате; добавление потребует отдельного подтверждения.`
          : "Не удалось сопоставить файл с каталогом. Для фото нужен читаемый артикул на этикетке; для PDF — текстовый слой. Укажите артикул или характеристики вручную. Корзина не изменена.", products: matched, cart: structuredClone(session.cart) };
      });
    } else answer = await replyToMessage(message, id, undefined, { confirmationId });
    const session = getSession(id);
    session.messages.push({ id: crypto.randomUUID(), role: "user", text: file ? "Прикреплён файл для поиска товаров" : message },
      { id: crypto.randomUUID(), role: "assistant", text: answer.message, data: answer });
    session.messages = session.messages.slice(-40);
    return jsonResponse(answer, id);
  } catch (error) {
    const text = error instanceof Error ? error.message : "";
    const known = /^(Поддерживаются|Файл должен|Содержимое|Сервис чтения|Не удалось прочитать|Чтение)/.test(text);
    return jsonResponse({ error: text === "Request too large" ? "Запрос слишком большой (файл до 5 МБ)." : known ? text : "Не удалось обработать запрос. Попробуйте ещё раз." }, id, text === "Request too large" ? 413 : 400);
  }
}
