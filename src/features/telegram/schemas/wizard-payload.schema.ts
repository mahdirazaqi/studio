import { z } from "zod";

import { commonSchemas } from "@/server/validation";
import { jobAssetInputSchema } from "@/features/jobs/schemas/job-asset-input.schema";
import { TEMPLATE_ASSET_KINDS } from "@/features/templates/domain/template";
import { MAX_ALBUM_TRACKS } from "@/features/telegram/domain/wizard";

/**
 * The `TelegramWizardState.payload` JSONB shape, validated on every read and
 * write (Phase 8 brief §46) — never trusted as opaque JSON past this
 * boundary. Deliberately small: only what's needed to resume the
 * conversation, never a raw Telegram update (§13/§46).
 *
 * Reuses `jobAssetInputSchema` verbatim for `tracks[][]` — the exact same
 * shape `createJobSchema` expects, so the confirmation step hands
 * `createJob` its `assets` array unchanged, with no Telegram-specific
 * reshaping (Phase 8 brief §20).
 */
const wizardSlotSchema = z.object({
  key: z.string().min(1).max(100),
  kind: z.enum(TEMPLATE_ASSET_KINDS),
});

export const wizardPayloadSchema = z.object({
  templateId: commonSchemas.id,
  /** Snapshotted for display in the confirmation summary — never re-derived
   * from a live Template lookup at confirm time, since the actual Job
   * creation always re-validates against the live Template anyway
   * (`create-job.ts`). */
  templateName: z.string().min(1).max(255),
  deliverToYouTube: z.boolean(),
  trackCount: z.number().int().min(1).max(MAX_ALBUM_TRACKS),
  /** Snapshotted from the Template at `PICK_TEMPLATE` time — see `WizardSlot`. */
  slots: z.array(wizardSlotSchema).max(50),
  /** One entry per track; a track is complete once its length equals `slots.length`. */
  tracks: z.array(z.array(jobAssetInputSchema).max(50)).max(MAX_ALBUM_TRACKS),
});

export type WizardPayload = z.infer<typeof wizardPayloadSchema>;
