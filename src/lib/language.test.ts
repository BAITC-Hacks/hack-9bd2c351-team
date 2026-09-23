import { afterEach, describe, expect, it, vi } from "vitest";
import { rewriteSearch } from "@/lib/language";
import { replyToMessage } from "@/lib/assistant";
import { clearSessions } from "@/lib/sessions";
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); clearSessions(); });
describe("optional AI retrieval boundary", () => {
  it("makes no external call without a key", async () => {
    vi.stubEnv("GEMINI_API_KEY", ""); const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    expect(await rewriteSearch("something")).toBeUndefined(); expect(fetchMock).not.toHaveBeenCalled();
  });
  it("uses a structured query and never turns model output into a cart write", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only-key"); vi.stubEnv("CATALOG_MODE", "demo");
    const fetchMock = vi.fn(async (_url, init) => {
      expect(JSON.parse(init.body).generationConfig.responseMimeType).toBe("application/json");
      expect(JSON.parse(init.body)).not.toHaveProperty("tools");
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({ query: "EKT-CB-16A", action: "add", quantity: 999, price: 1 }) }] } }] });
    });
    vi.stubGlobal("fetch", fetchMock);
    const answer = await replyToMessage("Подбери защиту цепи", "ai");
    expect(answer.product?.price).toBe(2450); expect(answer.cart).toEqual([]); expect(answer.confirmationId).toBeUndefined();
  });
  it.each(["malformed", JSON.stringify({ query: 23 }), JSON.stringify({ query: "x".repeat(301) })])("fails closed on invalid model output", async (text) => {
    vi.stubEnv("GEMINI_API_KEY", "test-only-key");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text }] } }] })));
    expect(await rewriteSearch("query")).toBeUndefined();
  });
  it("falls back after provider errors", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-only-key");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("timeout"); }));
    expect(await rewriteSearch("query")).toBeUndefined();
  });
});
