import type { Product } from "@/lib/types";
import { Icon } from "@/components/icons";
const labels: Record<string, string> = { poles: "Полюса", ratedCurrent: "Номинальный ток", breakingCapacity: "Отключающая способность", curve: "Характеристика", residualCurrent: "Ток утечки", type: "Тип", cores: "Жилы", crossSection: "Сечение", material: "Материал", voltage: "Напряжение", insulation: "Изоляция", power: "Мощность", socket: "Цоколь", temperature: "Температура света", protection: "Защита", grounding: "Заземление" };
export const formatMoney = (value: number) => `${new Intl.NumberFormat("ru-KZ").format(value)} ₸`;
function safeLink(value: string): string | undefined {
  if (value.startsWith("/certificates/") && !value.includes("..")) return value;
  try { const url = new URL(value); if (url.protocol === "https:" || url.protocol === "http:") return url.href; } catch { /* No untrusted protocols. */ }
}
export function ProductCard({ product, reason, disabled, onSelect }: { product: Product; reason?: string; disabled?: boolean; onSelect?: (message: string) => void }) {
  const stock = Object.values(product.stockByWarehouse).reduce((a, b) => a + b, 0);
  const quantified = Object.keys(product.stockByWarehouse).length > 0 && (product.source === "demo" || product.availabilityVerified);
  const certificate = product.certificateUrl && safeLink(product.certificateUrl);
  return <article className="product-card">
    <div className="product-top"><span className="product-symbol"><Icon name="bolt" size={27} /></span><div><span className="eyebrow">{product.category}</span><code>{product.sku}</code></div><span className={`stock ${quantified && stock > 0 ? "available" : "unavailable"}`}>{quantified ? stock > 0 ? `${stock} в наличии` : "Нет в наличии" : "Остаток не уточнён"}</span></div>
    <h3>{product.name}</h3><p>{product.description}</p>
    <dl className="specifications">{Object.entries(product.specifications).map(([key, value]) => <div key={key}><dt>{labels[key] ?? key}</dt><dd>{value}</dd></div>)}</dl>
    <div className="warehouses">{Object.entries(product.stockByWarehouse).map(([warehouse, count]) => <span key={warehouse}>{warehouse}: <b>{count}</b></span>)}</div>
    {reason && <p className="alternative-reason"><Icon name="check" size={16} />{reason}</p>}
    {certificate && <a className="certificate-link" href={certificate} target="_blank" rel="noreferrer"><Icon name="file" size={15} />{product.source === "demo" ? "Образец документа (демо)" : "Сертификат"} ↗</a>}
    {!certificate && <small className="muted">Сертификат не предоставлен</small>}
    <div className="product-bottom"><div><strong>{product.price === undefined ? "Цена по запросу" : formatMoney(product.price)}</strong><small>{product.packSize ? `За единицу · кратно ${product.packSize}` : "За штуку"}</small></div>
      {onSelect && <button className="product-select" disabled={disabled || !quantified || stock <= 0 || product.price === undefined} onClick={() => onSelect(`Добавь ${product.packSize ?? 1} ${product.sku}`)}><Icon name="cart" size={16} />Выбрать</button>}</div>
    <div className="source-note">{product.source === "demo" ? "Синтетический каталог · демонстрационные цена и остаток" : "Данные каталога ekt.kz · остаток проверяется при подтверждении"}</div>
  </article>;
}
