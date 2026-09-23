import type { SessionState } from "@/lib/types";

// Shared by route bundles and preserved through development hot reloads.
const runtime = globalThis as typeof globalThis & {
  ektSessions?: Map<string, SessionState>;
  ektLocks?: Map<string, Promise<unknown>>;
};
const sessions = runtime.ektSessions ??= new Map<string, SessionState>();
const locks = runtime.ektLocks ??= new Map<string, Promise<unknown>>();
export const SESSION_TTL = 2 * 60 * 60 * 1000;

export function existingSession(id: string): SessionState | undefined {
  const session = sessions.get(id);
  if (session && Date.now() - session.touchedAt < SESSION_TTL) return session;
  sessions.delete(id);
}

export function getSession(id: string): SessionState {
  let session = existingSession(id);
  if (!session) {
    for (const [key, value] of sessions) {
      if (Date.now() - value.touchedAt >= SESSION_TTL) sessions.delete(key);
    }
    if (sessions.size >= 1000) throw new Error("Session capacity reached");
    session = { cart: [], messages: [], lastResults: [], touchedAt: Date.now() };
    sessions.set(id, session);
  }
  session.touchedAt = Date.now();
  return session;
}

export async function withSessionLock<T>(id: string, operation: () => Promise<T>): Promise<T> {
  const previous = locks.get(id) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(operation);
  locks.set(id, next);
  try { return await next; }
  finally { if (locks.get(id) === next) locks.delete(id); }
}

export function clearSessions(): void { sessions.clear(); locks.clear(); }
