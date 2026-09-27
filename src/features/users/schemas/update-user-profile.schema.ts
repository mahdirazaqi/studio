import { z } from "zod";

import { commonSchemas } from "@/server/validation";
import { normalizePhone } from "@/features/telegram/domain/phone";

/**
 * Profile-editing input (Phase 20/ADR-0051) — `fullName`/`phone` only, the
 * two fields both the self-service `/profile` page and the MANAGER/ADMIN
 * "edit user" page ever submit. Never `role`/`departmentId`/`status`/
 * `email` — those go through their own existing, separately-authorized
 * schemas/actions (`change-user-role.schema.ts`,
 * `set-user-active-status.action.ts`), exactly like `templateInputSchema`
 * has no `departmentId` field (CLAUDE.md §10) so a privileged field can
 * never even reach the use case from this form, structurally, not by a
 * runtime check that could be forgotten.
 *
 * `phone` reuses `normalizePhone` (`features/telegram/domain/phone.ts`) —
 * the exact same digits-only normalization Telegram's own "share contact"
 * linking match already uses. This is deliberate, not an arbitrary choice:
 * whatever a user types here must normalize identically to what Telegram
 * linking expects, or a manually-entered phone could silently never match a
 * later Telegram link attempt. An empty string clears the phone number
 * (`phone: null`) — this is a legal state (docs/domain/users.md — existing
 * Users may have no phone at all).
 */
export const updateUserProfileSchema = z.object({
  fullName: commonSchemas.shortText,
  phone: z
    .string()
    .trim()
    .max(32, "Phone number is too long.")
    .optional()
    .default("")
    .refine(
      (value) => value === "" || isPlausiblePhone(value),
      "Please enter a valid phone number.",
    ),
});

export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;

/** The MANAGER/ADMIN-facing variant — same fields, plus which user. The
 * self-service action never accepts a client-supplied `userId` at all (it's
 * always `actor.userId`) — this schema exists only for the "edit another
 * user" action. */
export const updateUserProfileWithIdSchema = updateUserProfileSchema.extend({
  userId: commonSchemas.id,
});

export type UpdateUserProfileWithIdInput = z.infer<
  typeof updateUserProfileWithIdSchema
>;

/**
 * Not a general phone-number validation library (no `libphonenumber`) —
 * matches `normalizePhone`'s own stated scope. After stripping to digits, a
 * plausible phone number is somewhere between a short national number and a
 * full international one with a country code: 7–15 digits, the same upper
 * bound E.164 itself uses. Rejects obvious garbage (too short, letters only,
 * empty after stripping) without pretending to validate real-world
 * dialability per country.
 */
function isPlausiblePhone(value: string): boolean {
  const normalized = normalizePhone(value);
  return (
    normalized !== null && normalized.length >= 7 && normalized.length <= 15
  );
}
