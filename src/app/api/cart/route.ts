import { jsonResponse, requestSession } from "@/lib/http";
import { getSession } from "@/lib/sessions";
export async function GET(request: Request) {
  const id = requestSession(request);
  return jsonResponse({ cart: getSession(id).cart }, id);
}
