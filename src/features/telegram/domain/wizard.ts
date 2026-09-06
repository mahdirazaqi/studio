/**
 * Pure domain types/constants for the Telegram wizard (conversation) state
 * machine (docs/integrations/telegram.md, ADR-0037). No I/O, no Prisma
 * import — mirrors every other feature's `domain/` layer. Matches the
 * `TelegramWizardFlow`/`TelegramWizardStep` enums in `prisma/schema.prisma`
 * exactly; keep both in sync by hand (Prisma has no "derive enum from TS"
 * mechanism, same situation as every other domain enum in this codebase).
 */

export const TELEGRAM_WIZARD_FLOWS = ["SINGLE_TRACK", "ALBUM"] as const;
export type TelegramWizardFlow = (typeof TELEGRAM_WIZARD_FLOWS)[number];

export const TELEGRAM_WIZARD_STEPS = [
  "PICK_TEMPLATE",
  "ASK_DELIVERY",
  "ASK_TRACK_COUNT",
  "COLLECT_ASSETS",
  "CONFIRM",
  "CREATING",
  "COMPLETED",
] as const;
export type TelegramWizardStep = (typeof TELEGRAM_WIZARD_STEPS)[number];

/**
 * A hard ceiling on Album track count — not a legacy rule (legacy had none),
 * but a sane bound on how many Jobs one Telegram conversation can fan out
 * into in a single confirmation (Phase 8 brief §26's "do not implement a huge
 * distributed transaction system" cuts both ways: also don't let one confirm
 * tap queue an unbounded number of Jobs).
 */
export const MAX_ALBUM_TRACKS = 20;

/**
 * One Template slot, snapshotted into the wizard payload at `PICK_TEMPLATE`
 * time (docs/integrations/telegram.md "Conversation state") so a mid-
 * conversation Template edit can never shift which slots are being
 * collected — the eventual `createJob` call re-validates against the *live*
 * Template regardless (Phase 6's `create-job.ts`), so this snapshot is only
 * ever a conversational convenience, never a trust boundary.
 */
export interface WizardSlot {
  key: string;
  kind: "DATA" | "IMAGE" | "AUDIO" | "VIDEO";
}

/** Human-readable label for a slot kind, used in "send me your X" prompts. */
export function describeSlotKind(kind: WizardSlot["kind"]): string {
  switch (kind) {
    case "DATA":
      return "text";
    case "IMAGE":
      return "photo";
    case "AUDIO":
      return "audio file";
    case "VIDEO":
      return "video";
  }
}

/**
 * Advance the "which track, which slot" cursor after a track's values
 * change (or before any have been collected at all — called once with
 * `tracks: []` on first entering `COLLECT_ASSETS`). While the most recently
 * opened track already satisfies every slot — including instantly, for a
 * zero-asset Template (ADR-0027 allows one) — a new track is opened, up to
 * `trackCount`. Returns `allTracksDone: true` once `trackCount` tracks have
 * all been completed, the signal to advance to `CONFIRM`.
 *
 * This one function is what lets Single Track (`trackCount: 1`) and Album
 * (`trackCount: N`) share the exact same per-slot collection loop (Phase 8
 * brief §25 "redesign using Studio application services") — Single Track is
 * simply the `trackCount: 1` case, not a separately coded flow.
 */
export function advanceTrackCursor<T>(
  tracks: readonly T[][],
  slotCount: number,
  trackCount: number,
): { tracks: T[][]; allTracksDone: boolean } {
  let next: T[][] = tracks.map((track) => [...track]);
  for (;;) {
    const current = next[next.length - 1];
    const currentComplete =
      current === undefined || current.length >= slotCount;
    if (!currentComplete) return { tracks: next, allTracksDone: false };
    if (next.length >= trackCount) return { tracks: next, allTracksDone: true };
    next = [...next, []];
  }
}
