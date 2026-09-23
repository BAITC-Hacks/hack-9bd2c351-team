import { NextResponse } from "next/server";
import { getSession } from "@/lib/sessions";

export async function GET(request: Request) {
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) return NextResponse.json({ error: "A sessionId is required." }, { status: 400 });
  return NextResponse.json({ cart: getSession(sessionId).cart });
}

