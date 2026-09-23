import { jsonResponse, requestSession } from "@/lib/http";
import { getSession } from "@/lib/sessions";
import { usesLiveCatalog } from "@/lib/catalog";
export async function GET(request: Request) {
  const id = requestSession(request);
  const session = getSession(id);
  const pending = session.pendingCartChange;
  return jsonResponse({ cart: session.cart, messages: session.messages,
    confirmationId: pending && pending.expiresAt > Date.now() ? pending.id : null,
    catalogMode: usesLiveCatalog() ? "live" : "demo", aiEnabled: Boolean(process.env.GEMINI_API_KEY),
  }, id);
}
