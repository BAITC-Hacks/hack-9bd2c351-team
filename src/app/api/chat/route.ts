import { NextResponse } from "next/server";
import { replyToMessage } from "@/lib/assistant";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: unknown; sessionId?: unknown };
    if (typeof body.message !== "string" || !body.message.trim()) {
      return NextResponse.json({ error: "A non-empty message is required." }, { status: 400 });
    }
    if (typeof body.sessionId !== "string" || !body.sessionId.trim()) {
      return NextResponse.json({ error: "A sessionId is required." }, { status: 400 });
    }
    return NextResponse.json(replyToMessage(body.message, body.sessionId));
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }
}

