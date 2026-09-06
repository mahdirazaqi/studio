import "server-only";

import {
  Prisma,
  type TelegramWizardFlow,
  type TelegramWizardStep,
} from "@prisma/client";

import { db } from "@/server/db";
import { conflictError } from "@/server/errors/app-error";
import type { Role } from "@/lib/roles";

/**
 * The only module that queries the `User.phone`/`User.telegramUserId`
 * columns and the `TelegramWizardState` table (mirrors every other
 * feature's repository). Identity lookups here are **not**
 * `departmentScopeFilter`-scoped — there is no actor yet at the point these
 * run (resolving the actor is the whole point of `findUserByTelegramId`),
 * exactly like `@/server/auth/session`'s session lookup has no department
 * filter either.
 */

export interface LinkedTelegramUser {
  id: string;
  role: Role;
  departmentId: string;
  fullName: string;
}

const LINKED_USER_SELECT = {
  id: true,
  role: true,
  departmentId: true,
  fullName: true,
} satisfies Prisma.UserSelect;

/**
 * Resolve a Telegram identity to a Studio User — the Telegram-adapter
 * equivalent of `@/server/auth/session`'s `resolveSession`. Only an `ACTIVE`
 * user is ever returned: a `DISABLED` user cannot act through Telegram any
 * more than through the web session (docs/domain/users.md "Disabling"),
 * enforced by this query itself, not a separate check downstream.
 */
export async function findUserByTelegramId(
  telegramUserId: string,
): Promise<LinkedTelegramUser | null> {
  return db.user.findFirst({
    where: { telegramUserId, status: "ACTIVE" },
    select: LINKED_USER_SELECT,
  });
}

/**
 * Match an incoming "share contact" phone against `User.phone`
 * (docs/domain/users.md "Telegram linkage"). `phone` is unique at the
 * database level, so this can find at most one row — the "ambiguous match"
 * half of OD-06 cannot occur by construction (ADR-0036); only "no match"
 * remains possible. Only an `ACTIVE` user can be linked.
 */
export async function findActiveUserByPhone(
  phone: string,
): Promise<LinkedTelegramUser | null> {
  return db.user.findFirst({
    where: { phone, status: "ACTIVE" },
    select: LINKED_USER_SELECT,
  });
}

/** True when `error` is a Postgres unique-constraint violation (P2002). */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

/**
 * Set `telegramUserId` on the matched User. A unique-constraint violation
 * here means this Telegram identity is already linked to a *different*
 * User — defense-in-depth against a relink race (Phase 8 brief §8 "prevent
 * linking another user's Telegram account"); the use case never needs to
 * pre-check this, the database constraint is the actual guarantee.
 */
export async function linkTelegramIdentity(
  userId: string,
  telegramUserId: string,
): Promise<void> {
  try {
    await db.user.update({ where: { id: userId }, data: { telegramUserId } });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw conflictError(
        "This Telegram account is already linked to a different Studio user.",
      );
    }
    throw error;
  }
}

export interface WizardStateRow {
  telegramUserId: string;
  userId: string;
  flow: TelegramWizardFlow;
  step: TelegramWizardStep;
  /** Raw JSON — validated against `wizardPayloadSchema` by the use-case layer
   * (Phase 8 brief §46), never trusted here. Kept as `unknown` at this layer
   * on purpose, matching `job-repository.ts`'s identical treatment of
   * `Job.snapshot`. */
  payload: unknown;
  lastUpdateId: number | null;
  updatedAt: Date;
}

const WIZARD_STATE_SELECT = {
  telegramUserId: true,
  userId: true,
  flow: true,
  step: true,
  payload: true,
  lastUpdateId: true,
  updatedAt: true,
} satisfies Prisma.TelegramWizardStateSelect;

export async function findWizardState(
  telegramUserId: string,
): Promise<WizardStateRow | null> {
  return db.telegramWizardState.findUnique({
    where: { telegramUserId },
    select: WIZARD_STATE_SELECT,
  });
}

/**
 * Start a fresh conversation, replacing any existing one for this Telegram
 * user (matches legacy's `TelegrambotDataset.setTemplate`, which always
 * overwrote — picking a new template is always a deliberate restart, never
 * a resume). `userId` is `@unique` on the model too, so this also
 * guarantees at most one active wizard row per Studio User.
 */
export async function startWizardState(input: {
  telegramUserId: string;
  userId: string;
  flow: TelegramWizardFlow;
  step: TelegramWizardStep;
  payload: Prisma.InputJsonValue;
  lastUpdateId: number | null;
}): Promise<WizardStateRow> {
  return db.telegramWizardState.upsert({
    where: { telegramUserId: input.telegramUserId },
    create: input,
    update: {
      userId: input.userId,
      flow: input.flow,
      step: input.step,
      payload: input.payload,
      lastUpdateId: input.lastUpdateId,
    },
    select: WIZARD_STATE_SELECT,
  });
}

/**
 * The one place a wizard row's `step`/`payload` change after creation — an
 * atomic conditional `UPDATE ... WHERE step IN (fromSteps)`, the exact same
 * pattern as `job-repository.ts`'s `transitionJobRow` (ADR-0029) and for the
 * identical reason: a duplicate/racing Telegram update (Phase 8 brief §47/
 * §48/§51) must not be able to re-advance a step that already moved past
 * `fromSteps` — the loser's `updateMany` matches zero rows and this returns
 * `null`, which the use-case layer treats as "already being processed",
 * never as a silent no-op success.
 */
export async function advanceWizardState(
  telegramUserId: string,
  fromSteps: readonly TelegramWizardStep[],
  toStep: TelegramWizardStep,
  payload: Prisma.InputJsonValue,
  lastUpdateId: number | null,
): Promise<WizardStateRow | null> {
  const result = await db.telegramWizardState.updateMany({
    where: { telegramUserId, step: { in: [...fromSteps] } },
    data: { step: toStep, payload, lastUpdateId },
  });
  if (result.count === 0) return null;

  return db.telegramWizardState.findUniqueOrThrow({
    where: { telegramUserId },
    select: WIZARD_STATE_SELECT,
  });
}

/** Idempotent — resolves even if no row exists (already cleared/expired). */
export async function deleteWizardState(telegramUserId: string): Promise<void> {
  await db.telegramWizardState.deleteMany({ where: { telegramUserId } });
}
