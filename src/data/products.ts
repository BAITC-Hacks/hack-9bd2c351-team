import type { Product } from "@/lib/types";

type Sample = Omit<Product, "currency" | "source" | "availability" | "availabilityVerified">;
const samples: Sample[] = [
  { sku: "EKT-CB-16A", name: "Автоматический выключатель 16А, 1P", category: "Автоматические выключатели",
    description: "Однополюсный автомат для распределительного щита. Характеристика срабатывания C.", price: 2450,
    stockByWarehouse: { Алматы: 24, Астана: 11 }, specifications: { poles: "1P", ratedCurrent: "16 A", breakingCapacity: "6 kA", curve: "C" },
    certificateUrl: "/certificates/EKT-CB-16A.txt" },
  { sku: "EKT-CB-20A", name: "Автоматический выключатель 20А, 1P", category: "Автоматические выключатели",
    description: "Автомат C20 для распределительных щитов. В демонстрационном каталоге закончился.", price: 2590,
    stockByWarehouse: { Алматы: 0, Астана: 0 }, specifications: { poles: "1P", ratedCurrent: "20 A", breakingCapacity: "6 kA", curve: "C" } },
  { sku: "EKT-CB-20A-PRO", name: "Автоматический выключатель 20А Pro, 1P", category: "Автоматические выключатели",
    description: "Аналог C20 с совпадающими основными электрическими характеристиками.", price: 2980,
    stockByWarehouse: { Алматы: 8, Астана: 4 }, specifications: { poles: "1P", ratedCurrent: "20 A", breakingCapacity: "6 kA", curve: "C" },
    certificateUrl: "/certificates/EKT-CB-20A-PRO.txt" },
  { sku: "EKT-RCD-25A", name: "УЗО 25А, 30мА, 2P", category: "Устройства защитного отключения",
    description: "Двухполюсное УЗО типа AC. Защита при токе утечки.", price: 7890,
    stockByWarehouse: { Алматы: 6, Астана: 2 }, specifications: { poles: "2P", ratedCurrent: "25 A", residualCurrent: "30 mA", type: "AC" } },
  { sku: "EKT-CABLE-3X25", name: "Кабель ВВГнг-LS 3×2,5 мм²", category: "Кабель и провод",
    description: "Медный силовой кабель. Цена и остаток указаны за метр, отрез кратен 5 м.", price: 780, packSize: 5,
    stockByWarehouse: { Алматы: 150, Астана: 80 }, specifications: { cores: "3", crossSection: "2.5 mm²", material: "Cu", voltage: "660 V", insulation: "LS" } },
  { sku: "EKT-CABLE-3X15", name: "Кабель ВВГнг-LS 3×1,5 мм²", category: "Кабель и провод",
    description: "Медный кабель для стационарной прокладки. Цена за метр, отрез кратен 5 м.", price: 490, packSize: 5,
    stockByWarehouse: { Алматы: 200, Астана: 100 }, specifications: { cores: "3", crossSection: "1.5 mm²", material: "Cu", voltage: "660 V", insulation: "LS" } },
  { sku: "EKT-LED-12W", name: "Лампа LED 12Вт E27, 4000К", category: "Освещение",
    description: "Светодиодная лампа с нейтральным белым светом.", price: 1150,
    stockByWarehouse: { Алматы: 0, Астана: 0 }, specifications: { power: "12 W", socket: "E27", temperature: "4000 K", voltage: "220 V" } },
  { sku: "EKT-LED-12W-PRO", name: "Лампа LED 12Вт Pro E27, 4000К", category: "Освещение",
    description: "Лампа с тем же цоколем, напряжением, мощностью и цветовой температурой.", price: 1290,
    stockByWarehouse: { Алматы: 40, Астана: 25 }, specifications: { power: "12 W", socket: "E27", temperature: "4000 K", voltage: "220 V" } },
  { sku: "EKT-SOCKET-16A", name: "Розетка с заземлением 16А, IP44", category: "Розетки и выключатели",
    description: "Накладная розетка с крышкой и защитным контактом.", price: 3400,
    stockByWarehouse: { Алматы: 18, Астана: 9 }, specifications: { ratedCurrent: "16 A", voltage: "250 V", protection: "IP44", grounding: "Да" } },
];
export const products: Product[] = samples.map((product) => ({ ...product, currency: "KZT", source: "demo",
  availability: Object.values(product.stockByWarehouse).some((count) => count > 0) ? "available" : "unavailable",
  availabilityVerified: false,
}));

export const purchaseTerms = {
  payment: "Демо-условия оплаты: банковская карта на странице оформления или счёт для юридического лица. Платёжные данные в чат отправлять не нужно. Реальные условия ekt.kz уточняются у менеджера.",
  delivery: "Демо-условия доставки: самовывоз со склада или доставка по Казахстану. Стоимость и срок зависят от города и склада; их подтверждает менеджер до оформления.",
  minimumOrder: "Демо-условия минимальной партии: штучные товары — от 1 шт., кабель — от 5 м, кратно 5. Минимальной суммы в прототипе нет. Кратность указана в карточке товара.",
};
