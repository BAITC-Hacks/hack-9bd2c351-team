import type { SessionState } from "@/lib/types";

const sessions = new Map<string, SessionState>();

export function getSession(sessionId: string): SessionState {
  const existing = sessions.get(sessionId);
  if (existing) return existing;
  const created: SessionState = { cart: [] };
  sessions.set(sessionId, created);
  return created;
}

export function clearSessions(): void {
  sessions.clear();
}

