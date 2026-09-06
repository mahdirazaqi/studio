import type { Actor } from "@/server/authz";
import { findUserByTelegramId } from "@/features/telegram/repository/telegram-repository";

export interface TelegramIdentity {
  actor: Actor;
  fullName: string;
}

/**
 * Resolve a trusted Telegram numeric user id (from `ctx.from.id` — never from
 * `username`/`first_name`/callback data, Phase 8 brief §9) to an `Actor`, the
 * same shape `toActor(currentUser)` builds for a web session
 * (`@/server/authz`'s own doc comment anticipates exactly this). `null` means
 * "not linked, or linked to a since-disabled User" — the adapter's only job
 * is to explain that and offer the linking flow; it is never a bypass of
 * Phase 3 authorization, which every downstream use case still enforces
 * identically regardless of which transport built the `Actor`.
 */
export async function resolveTelegramIdentity(
  telegramUserId: string,
): Promise<TelegramIdentity | null> {
  const user = await findUserByTelegramId(telegramUserId);
  if (!user) return null;
  return {
    actor: {
      userId: user.id,
      role: user.role,
      departmentId: user.departmentId,
    },
    fullName: user.fullName,
  };
}
