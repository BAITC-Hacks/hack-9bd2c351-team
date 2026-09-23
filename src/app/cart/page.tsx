"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { CartItem } from "@/lib/types";

function CartContent() {
  const sessionId = useSearchParams().get("sessionId") ?? "";
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    fetch(`/api/cart?sessionId=${encodeURIComponent(sessionId)}`)
      .then((response) => response.json())
      .then((data: { cart?: CartItem[] }) => setCart(data.cart ?? []))
      .finally(() => setLoading(false));
  }, [sessionId]);

  const total = useMemo(() => cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0), [cart]);

  return (
    <main className="cart-page">
      <Link href="/" className="back-link">← Back to assistant</Link>
      <span className="eyebrow">Current session</span><h1>Your cart</h1>
      {loading ? <p>Loading cart…</p> : cart.length === 0 ? (
        <div className="empty-cart">Your cart is empty. Add an item through the assistant.</div>
      ) : (
        <div className="cart-card">
          {cart.map((item) => (
            <div className="cart-row" key={item.sku}>
              <div><strong>{item.name}</strong><small>{item.sku}</small></div>
              <span>{item.quantity} × {new Intl.NumberFormat("en-US").format(item.unitPrice)} KZT</span>
            </div>
          ))}
          <div className="cart-total"><span>Total</span><strong>{new Intl.NumberFormat("en-US").format(total)} KZT</strong></div>
        </div>
      )}
    </main>
  );
}

export default function CartPage() {
  return (
    <Suspense fallback={<main className="cart-page"><p>Loading cart…</p></main>}>
      <CartContent />
    </Suspense>
  );
}
