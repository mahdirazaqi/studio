import { endSession } from "@/server/auth/session";

/** End a session by its raw token. A missing/already-invalid token is a no-op. */
export async function signOut(token: string | null): Promise<void> {
  if (!token) return;
  await endSession(token);
}
