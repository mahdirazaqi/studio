import { AppError } from "@/server/errors/app-error";
import { normalizePhone } from "@/features/telegram/domain/phone";
import {
  findActiveUserByPhone,
  linkTelegramIdentity,
  type LinkedTelegramUser,
} from "@/features/telegram/repository/telegram-repository";

export type LinkTelegramAccountResult =
  | { linked: true; user: LinkedTelegramUser }
  | { linked: false; reason: "no_match" | "already_linked_elsewhere" };

/**
 * `/start` → "share contact" → match phone → link (docs/domain/users.md
 * "Telegram linkage", ADR-0036). Legacy behavior preserved: phone-based
 * linking, no separate password/OTP. Legacy behavior changed: matching a
 * `DISABLED` user's phone is treated identically to no match at all — a
 * disabled account gains no Telegram foothold (`findActiveUserByPhone`
 * already filters on `status: "ACTIVE"`).
 *
 * OD-06 ("ambiguous / no phone match") resolves as: ambiguity cannot occur
 * (`User.phone` is unique), so the only real case is "no match", handled
 * with one generic, safe message — never naming whether *some* user exists
 * with a different status, which would leak account existence.
 */
export async function linkTelegramAccount(
  telegramUserId: string,
  rawPhone: string,
): Promise<LinkTelegramAccountResult> {
  const phone = normalizePhone(rawPhone);
  const matched = phone ? await findActiveUserByPhone(phone) : null;
  if (!matched) return { linked: false, reason: "no_match" };

  try {
    await linkTelegramIdentity(matched.id, telegramUserId);
  } catch (error) {
    if (AppError.isAppError(error) && error.kind === "conflict") {
      return { linked: false, reason: "already_linked_elsewhere" };
    }
    throw error;
  }

  return { linked: true, user: matched };
}
