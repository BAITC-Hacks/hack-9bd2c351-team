"use client";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/icons";
import { ProductCard } from "@/components/product-card";
import type { AssistantResponse, CartItem, ChatMessage } from "@/lib/types";

const starters = [
  { icon: "bolt" as const, title: "Подобрать оборудование", detail: "По названию, артикулу или параметрам", query: "Нужен автомат 16А" },
  { icon: "box" as const, title: "Проверить наличие", detail: "Остатки по складам и доступные аналоги", query: "Есть ли EKT-CB-20A?" },
  { icon: "file" as const, title: "Узнать условия покупки", detail: "Оплата, доставка и минимальная партия", query: "Условия покупки" },
];
export function ChatWorkspace({ embedded = false }: { embedded?: boolean }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [input, setInput] = useState("");
  const [file, setFile] = useState<File>();
  const [sending, setSending] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [confirmationId, setConfirmationId] = useState<string>();
  const [mode, setMode] = useState("demo");
  const [ai, setAi] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);

  async function restore() {
    try {
      const response = await fetch("/api/session");
      if (!response.ok) throw new Error();
      const state = await response.json();
      setMessages(state.messages); setCart(state.cart); setConfirmationId(state.confirmationId ?? undefined);
      setMode(state.catalogMode); setAi(state.aiEnabled); setReady(true); setError("");
    } catch { setError("Не удалось подключиться. Проверьте соединение и повторите."); }
  }
  useEffect(() => { void restore(); }, []);
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, sending]);

  async function send(text: string, confirm?: string, attachment?: File) {
    if ((!text.trim() && !attachment) || inFlight.current || !ready) return;
    inFlight.current = true; setSending(true); setError("");
    const outgoing = text.trim();
    const displayText = /(?:\d[ -]?){13,19}/.test(outgoing) ? "[Платёжные данные скрыты]" : outgoing;
    const user: ChatMessage = { id: crypto.randomUUID(), role: "user", text: attachment ? `${outgoing ? outgoing + "\n" : ""}📎 ${attachment.name}` : displayText };
    setMessages((current) => [...current, user]); setInput(""); setFile(undefined);
    if (fileInput.current) fileInput.current.value = "";
    try {
      let body: BodyInit;
      let headers: HeadersInit | undefined;
      if (attachment) { const form = new FormData(); form.set("message", outgoing); form.set("file", attachment); body = form; }
      else { body = JSON.stringify({ message: outgoing, confirmationId: confirm }); headers = { "Content-Type": "application/json" }; }
      const response = await fetch("/api/chat", { method: "POST", headers, body });
      const data: AssistantResponse & { error?: string } = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "Не удалось отправить сообщение.");
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: data.message, data }]);
      setCart(data.cart ?? []); setConfirmationId(data.confirmationId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Нет соединения. Попробуйте снова.");
      setMessages((current) => current.filter((m) => m.id !== user.id)); setInput(outgoing); setFile(attachment);
    } finally { inFlight.current = false; setSending(false); inputRef.current?.focus(); }
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(input, undefined, file); }
  const busy = sending || !ready;
  return <main className={`workspace ${embedded ? "embedded" : ""}`}>
    {!embedded && <aside className="sidebar">
      <Link className="brand" href="/"><span className="brand-mark"><Icon name="bolt" size={26} /></span><div>ekt<span>.kz</span><small>Электрокомплект</small></div></Link>
      <div className="workspace-label">ВАШ ПОМОЩНИК</div>
      <div className="nav-active"><Icon name="chat" />Консультант<span className="online-dot" /></div>
      <Link className="nav-link" href="/cart"><Icon name="cart" />Корзина<span className="nav-count">{count}</span></Link>
      <div className="workspace-label topics-label">НАЧНИТЕ С ВОПРОСА</div>
      {starters.map((s) => <button className="sidebar-prompt" key={s.title} disabled={busy} onClick={() => void send(s.query)}><Icon name={s.icon} size={17} />{s.title}<Icon name="chevron" size={13} /></button>)}
      <div className="sidebar-bottom"><div className="session-note"><Icon name="shield" /><div><strong>Решение за вами</strong><p>Товары попадут в корзину только после вашего подтверждения.</p></div></div><div className="partner-mark">HACKALEM <span>AI / 2026</span></div></div>
    </aside>}
    <section className="main-panel">
      <header className="topbar"><div className="heading-icon"><Icon name="chat" size={19} /></div><div><h1>Консультант по каталогу</h1><p><span className="online-dot" />{ready ? "Готов помочь с выбором" : "Подключение…"}</p></div><span className="mode-badge">{mode === "demo" ? "Демо-каталог" : "Каталог EKT"}</span><Link className="mobile-cart" href="/cart" aria-label={`Корзина: ${count}`}><Icon name="cart" /><b>{count}</b></Link></header>
      <div className="conversation" role="log" aria-label="Диалог с консультантом" aria-live="polite">
        {!messages.length && <div className="welcome">
          <div className="welcome-symbol"><Icon name="bolt" size={36} /><span className="sparkle">✦</span></div>
          <span className="eyebrow">МЕНЬШЕ ПОИСКА. БОЛЬШЕ ДЕЛА.</span>
          <h2>Помогу найти<br />нужное <em>решение.</em></h2>
          <p>От характеристик до корзины — в одном диалоге.<br className="desktop-break" /> Спросите о товаре или прикрепите спецификацию.</p>
          <div className="starter-grid">{starters.map((s) => <button key={s.title} disabled={busy} onClick={() => void send(s.query)}><Icon name={s.icon} size={22} /><strong>{s.title}</strong><span>{s.detail}</span><span className="starter-arrow">↗</span></button>)}</div>
          <div className="example-note"><span>Например</span><button disabled={busy} onClick={() => void send("Добавь 2 EKT-CB-16A")}>«Нужно 2 автомата на 16А» ↗</button></div>
        </div>}
        {messages.map((message) => <div className={`message-row ${message.role}`} key={message.id}>
          {message.role === "assistant" && <div className="avatar"><Icon name="bolt" size={17} /></div>}
          <div className="message-content"><span className="message-author">{message.role === "assistant" ? "EKT · Консультант" : "Вы"}</span><div className="bubble">{message.text}</div>
            {message.data?.product && <ProductCard product={message.data.product} disabled={busy} onSelect={(text) => void send(text)} />}
            {message.data?.products?.map((p) => <ProductCard key={p.sku} product={p} disabled={busy} onSelect={(text) => void send(text)} />)}
            {message.data?.alternatives?.map((p) => <ProductCard key={p.sku} product={p} reason={message.data?.alternativeReasons?.[p.sku]} disabled={busy} onSelect={(text) => void send(text)} />)}
            {message.data?.confirmationId && message.data.confirmationId === confirmationId && <div className="confirmation-actions"><button className="confirm-button" disabled={busy} onClick={() => void send("да, добавь", confirmationId)}><Icon name="check" size={16} />Да, добавить</button><button className="cancel-button" disabled={busy} onClick={() => void send("Отмена")}>Отмена</button></div>}
            {message.data?.cartUrl && <Link className="cart-link" href="/cart">Открыть корзину <Icon name="chevron" size={16} /></Link>}
          </div>
        </div>)}
        {sending && <div className="typing"><span className="typing-dots"><i /><i /><i /></span>Проверяю данные…</div>}
        <div ref={bottom} />
      </div>
      <div className="compose-area">
        {messages.length > 0 && <div className="suggestions">{["Автомат 16А", "Покажи EKT-CB-20A", "Оплата и доставка"].map((s) => <button key={s} disabled={busy} onClick={() => void send(s)}>{s}</button>)}</div>}
        {error && <div role="alert" className="error-message">{error}{!ready && <button onClick={() => void restore()}>Повторить</button>}</div>}
        <form className="composer" onSubmit={submit}>
          {file && <div className="file-chip"><Icon name="file" size={16} /><span>{file.name}</span><button aria-label="Убрать файл" type="button" onClick={() => { setFile(undefined); if (fileInput.current) fileInput.current.value = ""; }}><Icon name="close" size={14} /></button></div>}
          <div className="input-row"><button className="attach-button" title="Прикрепить спецификацию или фото" aria-label="Прикрепить файл" type="button" disabled={busy} onClick={() => fileInput.current?.click()}><Icon name="paperclip" /></button>
            <input type="file" ref={fileInput} hidden accept=".xlsx,.docx,.pdf,.jpg,.jpeg,.png" onChange={(event) => { const chosen = event.target.files?.[0]; if (chosen && chosen.size > 5 * 1024 * 1024) { setError("Максимальный размер файла — 5 МБ."); event.target.value = ""; } else { setFile(chosen); setError(""); } }} />
            <input ref={inputRef} maxLength={2000} aria-label="Сообщение" value={input} disabled={busy} onChange={(event) => setInput(event.target.value)} placeholder="Спросите о товаре, наличии или доставке…" />
            <button className="send-button" type="submit" disabled={busy || (!input.trim() && !file)} aria-label="Отправить сообщение"><Icon name="arrow" size={21} /></button></div>
          <div className="composer-caption"><span>XLSX, DOCX, PDF, JPEG · до 5 МБ</span><span>Enter ↵</span></div>
        </form>
        <p className="disclaimer">{ai ? "AI-поиск: запрос и выбранный товар могут передаваться Gemini. " : ""}Файлы обрабатываются локально. Не отправляйте платёжные данные.</p>
      </div>
    </section>
  </main>;
}
