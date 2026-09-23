import { NextResponse } from "next/server";
import { existingSession, getSession, SESSION_TTL } from "@/lib/sessions";

const cookieName = "ekt_session";

export function requestSession(request: Request): string {
  const id = request.headers.get("cookie")?.split(";").map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
  if (id && /^[a-f0-9-]{36}$/.test(id) && existingSession(id)) return id;
  const created = crypto.randomUUID();
  getSession(created);
  return created;
}

export function jsonResponse(data: unknown, id?: string, status = 200): NextResponse {
  const response = NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
  if (id) response.cookies.set(cookieName, id, {
    httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: SESSION_TTL / 1000,
  });
  return response;
}

export function isSameOrigin(request: Request): boolean {
  const url = new URL(request.url);
  // Next normalizes loopback URLs; Host retains the browser's actual authority.
  // Behind a TLS reverse proxy, set APP_ORIGIN to its public HTTPS origin.
  const expected = process.env.APP_ORIGIN || `${url.protocol}//${request.headers.get("host") || url.host}`;
  return request.headers.get("origin") === expected
    && request.headers.get("sec-fetch-site") !== "cross-site";
}

export async function readLimited(request: Request, limit: number): Promise<Uint8Array> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) { await reader.cancel(); throw new Error("Request too large"); }
    chunks.push(value);
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
