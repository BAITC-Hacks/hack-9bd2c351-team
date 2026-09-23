export type Product = {
  sku: string;
  name: string;
  category: string;
  description: string;
  price?: number;
  currency: "KZT";
  stockByWarehouse: Record<string, number>;
  specifications: Record<string, string>;
  certificateUrl?: string;
  imageUrl?: string;
  productUrl?: string;
  apiId?: string;
  source: "live" | "demo";
  availability: "available" | "unavailable" | "unknown";
  availabilityVerified: boolean;
  packSize?: number;
};

export type CartItem = {
  sku: string;
  name: string;
  quantity: number;
  unitPrice: number;
  source: Product["source"];
};

export type PendingCartChange = {
  id: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  source: Product["source"];
  expiresAt: number;
};

export type ChatMessage = { id: string; role: "assistant" | "user"; text: string; data?: AssistantResponse };

export type SessionState = {
  cart: CartItem[];
  pendingCartChange?: PendingCartChange;
  lastProduct?: Product;
  lastResults: Product[];
  messages: ChatMessage[];
  touchedAt: number;
};

export type AssistantResponse = {
  message: string;
  product?: Product;
  products?: Product[];
  alternatives?: Product[];
  alternativeReasons?: Record<string, string>;
  cart?: CartItem[];
  cartUrl?: string;
  awaitingConfirmation?: boolean;
  confirmationId?: string;
  suggestions?: string[];
  catalogSource?: "live" | "demo" | "unavailable";
  availabilityVerified?: boolean;
};
