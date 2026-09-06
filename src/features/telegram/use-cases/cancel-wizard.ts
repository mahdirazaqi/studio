import { deleteWizardState } from "@/features/telegram/repository/telegram-repository";

/**
 * `/cancel` (Phase 8 brief §35). Clears persistent conversation state only —
 * never touches an already-created Job (Jobs are never deleted/edited,
 * ADR-0005) and never touches a Gallery File already uploaded during the
 * conversation (a Telegram-uploaded File is an ordinary Gallery asset the
 * moment it's uploaded, not a temporary object needing cleanup — see
 * `features/telegram/use-cases/collect-asset-value.ts`'s doc comment).
 * Idempotent — safe to call with no active conversation.
 */
export async function cancelWizard(telegramUserId: string): Promise<void> {
  await deleteWizardState(telegramUserId);
}
