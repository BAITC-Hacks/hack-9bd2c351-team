"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";
import { formatMoney } from "@/components/product-card";
import type { CartItem } from "@/lib/types";
export default function CartPage() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  async function load() {
    setLoading(true); setError(false);
    try { const response = await fetch("/api/cart", { cache: "no-store" }); if (!response.ok) throw new Error(); setCart((await response.json()).cart); }
    catch { setError(true); } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  const total = cart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  return <main className="cart-page"><Link href="/" className="back-link">← Вернуться к консультанту</Link><span className="eyebrow">ВАШ ВЫБОР</span><h1>Корзина<span>.</span></h1><p className="cart-subtitle">Только позиции, которые вы подтвердили.</p>
    {loading ? <p role="status">Загружаю корзину…</p> : error ? <div className="error-message" role="alert">Не удалось загрузить корзину. <button onClick={() => void load()}>Повторить</button></div> : !cart.length ? <div className="empty-cart"><Icon name="cart" size={40} /><h2>Пока ничего нет</h2><p>Подберите товар с консультантом и подтвердите добавление.</p><Link className="cart-link" href="/">Подобрать товары →</Link></div> : <div className="cart-layout"><div className="cart-card">{cart.map((item) => <div className="cart-row" key={item.sku}><span className="product-symbol"><Icon name="bolt" /></span><div className="cart-item-title"><strong>{item.name}</strong><small>{item.sku} · {item.source === "demo" ? "Демо-данные" : "EKT"}</small></div><div className="cart-price"><span>{item.quantity} × {formatMoney(item.unitPrice)}</span><strong>{formatMoney(item.quantity * item.unitPrice)}</strong></div></div>)}</div><aside className="cart-summary"><h2>Ваш заказ</h2><p><span>Количество единиц</span><b>{cart.reduce((sum, i) => sum + i.quantity, 0)}</b></p><div className="cart-total"><span>Итого</span><strong>{formatMoney(total)}</strong></div><div className="demo-notice"><Icon name="shield" /><p>Это корзина прототипа. Оплата и реальное оформление заказа не подключены. Наличие не резервируется.</p></div><Link className="cart-link" href="/">Продолжить подбор →</Link></aside></div>}
  </main>;
}
