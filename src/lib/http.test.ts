import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/chat/route";
import { GET as sessionGet } from "@/app/api/session/route";
import { GET as cartGet } from "@/app/api/cart/route";
import { clearSessions } from "@/lib/sessions";
const origin = "http://localhost:3000";
async function session() {
  const response = await sessionGet(new Request(`${origin}/api/session`));
  return response.headers.get("set-cookie")!.split(";")[0];
}
async function chat(cookie: string, message: string, extra = {}) {
  return POST(new Request(`${origin}/api/chat`, { method: "POST", headers: { Origin: origin, cookie, "Content-Type": "application/json" }, body: JSON.stringify({ message, ...extra }) }));
}
describe("browser session and API boundaries", () => {
  beforeEach(clearSessions);
  it("uses HttpOnly cookies and returns no session token in JSON", async () => {
    const response = await sessionGet(new Request(`${origin}/api/session`));
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=strict");
    expect(await response.json()).not.toHaveProperty("sessionId");
  });
  it("ignores user-supplied session IDs in bodies and cart URLs", async () => {
    const a = await session(), b = await session();
    await chat(a, "Add 2 EKT-CB-16A"); await chat(a, "да, добавь");
    const other = await cartGet(new Request(`${origin}/api/cart?sessionId=${a.split("=")[1]}`, { headers: { cookie: b } }));
    expect((await other.json()).cart).toEqual([]);
    const mine = await cartGet(new Request(`${origin}/api/cart`, { headers: { cookie: a } }));
    expect((await mine.json()).cart[0].quantity).toBe(2);
  });
  it("rejects cross-origin writes", async () => {
    const response = await POST(new Request(`${origin}/api/chat`, { method: "POST", headers: { Origin: "https://attacker.invalid" }, body: JSON.stringify({ message: "да, добавь" }) }));
    expect(response.status).toBe(403);
  });
  it("retains history in the browser session but not payment details", async () => {
    const cookie = await session();
    await chat(cookie, "Нужен автомат 16А"); await chat(cookie, "Моя карта 4111 1111 1111 1111");
    const response = await sessionGet(new Request(`${origin}/api/session`, { headers: { cookie } }));
    const body = await response.json();
    expect(body.messages).toHaveLength(2);
    expect(JSON.stringify(body)).not.toContain("4111");
  });
  it("validates request length", async () => {
    const response = await chat(await session(), "a".repeat(17000));
    expect(response.status).toBe(413);
  });
});
