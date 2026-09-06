import type { Prisma } from "@prisma/client";

import type { Actor } from "@/server/authz";
import {
  businessRuleError,
  conflictError,
  validationError,
} from "@/server/errors/app-error";
import { uploadFile } from "@/features/files/use-cases/upload-file";
import type { JobAssetInput } from "@/features/jobs/schemas/job-asset-input.schema";
import {
  advanceTrackCursor,
  describeSlotKind,
} from "@/features/telegram/domain/wizard";
import { advanceWizardState } from "@/features/telegram/repository/telegram-repository";
import type { WizardPayload } from "@/features/telegram/schemas/wizard-payload.schema";
import type { WizardSlot } from "@/features/telegram/domain/wizard";

/**
 * A transport-neutral description of one Telegram message's content —
 * built by the composer (`features/telegram/bot/composer.ts`), which has
 * already downloaded any media bytes over HTTP. Keeps Telegraf's `Context`
 * type (and everything else transport-specific) out of the use-case layer,
 * matching every other feature's boundary
 * (docs/architecture/project-structure.md's layer table: use cases must not
 * import transport types).
 */
export type IncomingAssetValue =
  { kind: "text"; text: string } | { kind: "file"; file: File };

export interface CollectAssetValueResult {
  outcome: "next_slot" | "confirm_ready";
  nextSlot?: WizardSlot;
  payload: WizardPayload;
}

/**
 * One step of the shared per-slot collection loop (Phase 8 brief §21,
 * §25 — the same loop Single Track and Album both use, parameterized only by
 * `trackCount`). Every file value goes through the **real** File upload use
 * case (`features/files/use-cases/upload-file.ts`) — the same one the
 * Gallery's own upload form calls — so content-type sniffing, size limits,
 * and department scoping are enforced identically regardless of entry point
 * (Phase 8 brief §22 "do not bypass File Gallery rules"). A Telegram-
 * declared media type is never trusted on its own: if a Template slot asks
 * for `AUDIO` and the sniffed upload turns out to be a video, this rejects
 * it exactly as if the same mismatch had been submitted from the dashboard.
 *
 * **Not implemented, deliberately**: aspect-ratio validation. The
 * dashboard's own `create-job.ts`/`resolve-job-assets.ts` do not compare an
 * uploaded image's dimensions against a slot's `imageRatio` either (OD-14 is
 * still open) — inventing a Telegram-only check here would give Job creation
 * two different validation behaviors depending on entry point, which Phase 8
 * brief §66 explicitly forbids ("the same business operation must produce
 * the same domain behavior regardless of entry point"). Legacy's own
 * aspect-ratio check used exact float equality, a known bug
 * (docs/legacy/known-issues.md) — not reproduced either way.
 */
export async function collectAssetValue(
  actor: Actor,
  telegramUserId: string,
  updateId: number,
  currentPayload: WizardPayload,
  incoming: IncomingAssetValue,
): Promise<CollectAssetValueResult> {
  const trackIndex = currentPayload.tracks.length - 1;
  const currentTrack = currentPayload.tracks[trackIndex] ?? [];
  const slot = currentPayload.slots[currentTrack.length];
  if (!slot) {
    throw businessRuleError("There is nothing left to collect for this job.");
  }

  const value = await resolveSlotValue(actor, slot, incoming);

  const tracksWithValue = currentPayload.tracks.map((track, index) =>
    index === trackIndex ? [...track, value] : track,
  );
  const { tracks, allTracksDone } = advanceTrackCursor(
    tracksWithValue,
    currentPayload.slots.length,
    currentPayload.trackCount,
  );
  const nextPayload: WizardPayload = { ...currentPayload, tracks };
  const nextStep = allTracksDone ? "CONFIRM" : "COLLECT_ASSETS";

  const updated = await advanceWizardState(
    telegramUserId,
    ["COLLECT_ASSETS"],
    nextStep,
    nextPayload as unknown as Prisma.InputJsonValue,
    updateId,
  );
  if (!updated) {
    throw conflictError(
      "This step already moved on. Please continue from the current menu.",
    );
  }

  if (allTracksDone) return { outcome: "confirm_ready", payload: nextPayload };

  const nextTrack = tracks[tracks.length - 1] ?? [];
  const nextSlot = currentPayload.slots[nextTrack.length];
  return { outcome: "next_slot", nextSlot, payload: nextPayload };
}

async function resolveSlotValue(
  actor: Actor,
  slot: WizardSlot,
  incoming: IncomingAssetValue,
): Promise<JobAssetInput> {
  if (slot.kind === "DATA") {
    if (incoming.kind !== "text" || !incoming.text.trim()) {
      throw validationError(`Please send text for "${slot.key}".`);
    }
    return { slotKey: slot.key, text: incoming.text.trim() };
  }

  if (incoming.kind !== "file") {
    throw validationError(
      `Please send a ${describeSlotKind(slot.kind)} for "${slot.key}".`,
    );
  }

  // No `departmentId` is ever passed here — a Telegram upload always lands
  // in the actor's own Department, even for ADMIN (Phase 8 brief §10: no
  // Telegram-specific authoring-for-another-department surface).
  const { file } = await uploadFile(actor, { file: incoming.file });
  if (file.kind !== slot.kind) {
    throw businessRuleError(
      `That file looks like ${file.kind.toLowerCase()}, but "${slot.key}" needs a ${describeSlotKind(slot.kind)}.`,
    );
  }
  return { slotKey: slot.key, fileId: file.id };
}
