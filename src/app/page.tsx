"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import type { AssistantResponse, Product } from "@/lib/types";

type ChatMessage = { id: string; role: "assistant" | "user"; text: string; data?: AssistantResponse };
const examples = ["Show EKT-CB-16A", "Is EKT-CB-20A available?", "What are the delivery terms?"];

function ProductCard({ product, label = "Catalog match" }: { product: Product; label?: string }) {
  const stock = Object.values(product.stockByWarehouse).reduce((sum, count) => sum + count, 0);
  return (
    <article className="product-card">
      <span className="eyebrow">{label}</span>
      <h3>{product.name}</h3>
      <div className="product-meta">
        <span>{product.sku}</span>
        <span className={stock > 0 ? "stock available" : "stock unavailable"}>{stock > 0 ? `${stock} in stock` : "Out of stock"}</span>
      </div>
      <p>{product.description}</p>
      <strong>{new Intl.NumberFormat("en-US").format(product.price)} KZT</strong>
    </article>
  );
}

export default function Home() {
  const [sessionId] = useState(() => crypto.randomUUID());
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: "welcome", role: "assistant",
    text: "Hello — I can help you find electrical products, verify stock and certificates, compare alternatives, and prepare a cart safely.",
  }]);

  const cartCount = useMemo(() => {
    const latest = [...messages].reverse().find((message) => message.data?.cart)?.data?.cart ?? [];
    return latest.reduce((sum, item) => sum + item.quantity, 0);
  }, [messages]);

  async function sendMessage(text: string) {
    const clean = text.trim();
    if (!clean || sending) return;
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: clean }]);
    setInput("");
    setSending(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: clean, sessionId }),
      });
      const data = (await response.json()) as AssistantResponse & { error?: string };
      setMessages((current) => [...current, {
        id: crypto.randomUUID(), role: "assistant", text: data.error ?? data.message,
        data: data.error ? undefined : data,
      }]);
    } catch {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: "The service is unavailable. Please try again." }]);
    } finally {
      setSending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">E</div>
        <div><span className="eyebrow">Elektrokomplekt</span><h1>Catalog assistant</h1></div>
        <Link className="cart-pill" href={`/cart?sessionId=${encodeURIComponent(sessionId)}`}>Cart <span>{cartCount}</span></Link>
      </header>

      <section className="hero-copy">
        <span className="status"><i /> Prototype catalog is online</span>
        <h2>Technical answers,<br />without the waiting.</h2>
        <p>Grounded product details, live demo stock, and a confirmation-safe cart.</p>
      </section>

      <section className="chat-panel" aria-label="Product assistant chat">
        <div className="messages" aria-live="polite">
          {messages.map((message) => (
            <div className={`message-row ${message.role}`} key={message.id}>
              {message.role === "assistant" && <div className="avatar">E</div>}
              <div className="message-content">
                <div className="bubble">{message.text}</div>
                {message.data?.product && <ProductCard product={message.data.product} />}
                {message.data?.alternatives?.map((product) => <ProductCard key={product.sku} product={product} label="Suggested alternative" />)}
                {message.data?.awaitingConfirmation && <button className="confirm-button" type="button" onClick={() => void sendMessage("yes, add it")}>Confirm add to cart</button>}
                {message.data?.cartUrl && <Link className="cart-link" href={message.data.cartUrl}>View current cart →</Link>}
              </div>
            </div>
          ))}
          {sending && <div className="typing">Checking the catalog <span>•••</span></div>}
        </div>

        <div className="suggestions">
          {examples.map((example) => <button type="button" key={example} onClick={() => void sendMessage(example)}>{example}</button>)}
        </div>
        <form className="composer" onSubmit={handleSubmit}>
          <input aria-label="Message" value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask about a product, SKU, delivery..." />
          <button type="submit" disabled={sending || !input.trim()} aria-label="Send message">↗</button>
        </form>
        <p className="disclaimer">Demo data only · The assistant never requests payment details</p>
      </section>
    </main>
  );
}

