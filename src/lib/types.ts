export type Product = {
  sku: string;
  name: string;
  category: string;
  description: string;
  price: number;
  currency: "KZT";
  stockByWarehouse: Record<string, number>;
  specifications: Record<string, string>;
  certificateUrl?: string;
};

export type CartItem = {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
};

export type SessionState = {
  cart: CartItem[];
  pendingCartChange?: { sku: string; quantity: number };
};

export type AssistantResponse = {
  message: string;
  product?: Product;
  alternatives?: Product[];
  cart?: CartItem[];
  cartUrl?: string;
  awaitingConfirmation?: boolean;
};

