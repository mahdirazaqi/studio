import "server-only";

import { type Prisma } from "@prisma/client";

import { db } from "@/server/db";
import { env } from "@/server/env";
import { conflictError } from "@/server/errors/app-error";
import { departmentScopeFilter, type Actor } from "@/server/authz";
import type { Paginated } from "@/types";
import type {
  JobAssetKind,
  JobSnapshot,
  JobState,
  SafeJob,
  SafeJobAsset,
  SafeJobDetail,
} from "@/features/jobs/domain/job";

/**
 * The only module that queries the `Job`/`JobAsset` tables — mirrors
 * `features/templates/repository/template-repository.ts`. Every read applies
 * `departmentScopeFilter(actor)`; the Worker-facing operations
 * (`claimNextJobRow`, `transitionJobRow`, `setProgress`, `setDuration`) are
 * deliberately **not** department-scoped — a Worker claims from the global
 * queue and updates whatever job it holds, exactly like legacy's `fetch` did,
 * just atomic (docs/domain/jobs.md "Worker claim").
 */

const SAFE_JOB_SELECT = {
  id: true,
  departmentId: true,
  templateId: true,
  template: { select: { name: true } },
  title: true,
  state: true,
  progress: true,
  durationSeconds: true,
  deliverToYouTube: true,
  retryOfJobId: true,
  attemptNumber: true,
  createdByUserId: true,
  createdBy: { select: { fullName: true } },
  errorReason: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.JobSelect;

type SafeJobRow = Prisma.JobGetPayload<{ select: typeof SAFE_JOB_SELECT }>;

function toSafeJob(row: SafeJobRow): SafeJob {
  return {
    id: row.id,
    departmentId: row.departmentId,
    templateId: row.templateId,
    templateName: row.template.name,
    title: row.title,
    state: row.state,
    progress: row.progress,
    durationSeconds: row.durationSeconds,
    deliverToYouTube: row.deliverToYouTube,
    retryOfJobId: row.retryOfJobId,
    attemptNumber: row.attemptNumber,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdBy?.fullName ?? null,
    errorReason: row.errorReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const SAFE_JOB_DETAIL_SELECT = {
  ...SAFE_JOB_SELECT,
  snapshot: true,
  retriedByUserId: true,
  retriedBy: { select: { fullName: true } },
  retryReason: true,
  canceledByUserId: true,
  canceledBy: { select: { fullName: true } },
  canceledAt: true,
  cancelReason: true,
  claimedAt: true,
  startedAt: true,
  renderedAt: true,
  deliveredAt: true,
  uploadedAt: true,
  assets: {
    select: {
      id: true,
      slotKey: true,
      kind: true,
      composition: true,
      layer: true,
      textValue: true,
      fileId: true,
      fileOriginalName: true,
      fileMimeType: true,
      fileSizeBytes: true,
      fileWidth: true,
      fileHeight: true,
      order: true,
    },
    orderBy: { order: "asc" },
  },
} satisfies Prisma.JobSelect;

type SafeJobDetailRow = Prisma.JobGetPayload<{
  select: typeof SAFE_JOB_DETAIL_SELECT;
}>;

function toSafeJobDetail(row: SafeJobDetailRow): SafeJobDetail {
  return {
    ...toSafeJob(row),
    snapshot: row.snapshot as unknown as JobSnapshot,
    assets: row.assets.map((asset): SafeJobAsset => ({
      id: asset.id,
      slotKey: asset.slotKey,
      kind: asset.kind,
      composition: asset.composition,
      layer: asset.layer,
      textValue: asset.textValue,
      fileId: asset.fileId,
      fileOriginalName: asset.fileOriginalName,
      fileMimeType: asset.fileMimeType,
      fileSizeBytes: asset.fileSizeBytes,
      fileWidth: asset.fileWidth,
      fileHeight: asset.fileHeight,
      order: asset.order,
    })),
    retriedByUserId: row.retriedByUserId,
    retriedByName: row.retriedBy?.fullName ?? null,
    retryReason: row.retryReason,
    canceledByUserId: row.canceledByUserId,
    canceledByName: row.canceledBy?.fullName ?? null,
    canceledAt: row.canceledAt,
    cancelReason: row.cancelReason,
    claimedAt: row.claimedAt,
    startedAt: row.startedAt,
    renderedAt: row.renderedAt,
    deliveredAt: row.deliveredAt,
    uploadedAt: row.uploadedAt,
  };
}

export interface JobAssetData {
  slotKey: string | null;
  kind: JobAssetKind;
  composition: string | null;
  layer: string | null;
  textValue: string | null;
  fileId: string | null;
  fileOriginalName: string | null;
  fileMimeType: string | null;
  fileSizeBytes: number | null;
  fileWidth: number | null;
  fileHeight: number | null;
}

export interface CreateJobData {
  departmentId: string;
  createdByUserId: string;
  templateId: string;
  snapshot: JobSnapshot;
  title: string;
  deliverToYouTube: boolean;
  assets: JobAssetData[];
}

/**
 * Postgres advisory-lock namespace for the daily upload quota (ADR-0030).
 * Arbitrary but fixed and unique within the app — namespaces this lock apart
 * from any other advisory lock Studio might use later. Combined with a
 * per-UTC-day key (`hashtext(...)`) via the two-int `pg_advisory_xact_lock`
 * overload, so the lock is automatically released at transaction end
 * regardless of commit/rollback — no manual unlock call needed.
 */
const UPLOAD_QUOTA_LOCK_NAMESPACE = 823_641;

function utcDateKey(now: Date): string {
  return now.toISOString().slice(0, 10); // "YYYY-MM-DD", UTC by construction
}

/**
 * Race-safe: every concurrent Job creation with `deliverToYouTube: true`
 * takes this advisory lock (keyed by the current UTC day) before counting
 * today's usage, serializing all such creations for that day into a queue.
 * Once inside the lock, the count-then-insert below can never race — the
 * next waiter only proceeds after this transaction commits or rolls back
 * (ADR-0030). A plain "count, then insert" without this lock is exactly the
 * race the Phase 6 brief §28 forbids.
 *
 * This throws a business-facing `conflict` error directly from the
 * repository, which is otherwise not this layer's job
 * (docs/architecture/project-structure.md's layer table lists "business/
 * authorization decisions" under repository's "Must NOT"). The exception is
 * deliberate: "atomic ops" *is* a repository responsibility per that same
 * table, and the lock + count + insert only work as a single atomic unit
 * inside one `$transaction` callback — splitting the quota check out to the
 * use-case layer would mean opening a second transaction (or none), losing
 * the very atomicity this function exists to provide. See ADR-0030.
 */
async function assertUploadQuotaAvailable(
  tx: Prisma.TransactionClient,
  now: Date,
): Promise<void> {
  // Both arguments to the two-int `pg_advisory_xact_lock` overload must be
  // `int4` — Prisma sends a bare numeric literal as `int8`/`numeric` by
  // default, which matches no overload (`42883: function ... does not
  // exist`), so both are cast explicitly.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${UPLOAD_QUOTA_LOCK_NAMESPACE}::int, hashtext(${utcDateKey(now)})::int)`;

  const startOfUtcDay = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const usedCapacity = await tx.job.count({
    where: {
      deliverToYouTube: true,
      state: { notIn: ["ERROR", "CANCELED"] },
      createdAt: { gte: startOfUtcDay },
    },
  });

  if (usedCapacity >= env.JOB_UPLOAD_DAILY_CAP) {
    throw conflictError(
      `The daily limit of ${env.JOB_UPLOAD_DAILY_CAP} upload-enabled jobs has been reached. Try again after midnight UTC, or create this job without YouTube delivery.`,
      { code: "job.upload_quota_exceeded" },
    );
  }
}

export async function createJobWithAssets(
  data: CreateJobData,
): Promise<SafeJobDetail> {
  const row = await db.$transaction(async (tx) => {
    if (data.deliverToYouTube) {
      await assertUploadQuotaAvailable(tx, new Date());
    }
    return tx.job.create({
      data: {
        departmentId: data.departmentId,
        createdByUserId: data.createdByUserId,
        templateId: data.templateId,
        snapshot: data.snapshot as unknown as Prisma.InputJsonValue,
        title: data.title,
        deliverToYouTube: data.deliverToYouTube,
        assets: {
          create: data.assets.map((asset, index) => ({
            ...asset,
            order: index,
          })),
        },
      },
      select: SAFE_JOB_DETAIL_SELECT,
    });
  });
  return toSafeJobDetail(row);
}

/** Cheap, unscoped state lookup — used by `transitionJob`/`updateJobProgress`/
 * `updateJobDuration` to produce a specific, friendly error before attempting
 * the atomic conditional update (which remains the actual correctness
 * guarantee against a concurrent change). Worker-facing — no department
 * scope, matching every other function below it. */
export async function findJobState(
  jobId: string,
): Promise<{ state: JobState } | null> {
  return db.job.findUnique({ where: { id: jobId }, select: { state: true } });
}

/**
 * Load a Job the actor is allowed to see, or `null` for both "doesn't exist"
 * and "exists in another department" (docs/architecture/authorization.md
 * 403-vs-404 guidance). No state filter — a Job is a permanent historical
 * record and remains viewable in every state, forever.
 */
export async function findJobInScope(
  actor: Actor,
  jobId: string,
): Promise<SafeJobDetail | null> {
  const row = await db.job.findFirst({
    where: { id: jobId, ...departmentScopeFilter(actor) },
    select: SAFE_JOB_DETAIL_SELECT,
  });
  return row ? toSafeJobDetail(row) : null;
}

/**
 * Worker-facing, unscoped lookup — no department filter (Phase 7,
 * docs/integrations/worker-api.md "Worker Job ownership / claim semantics").
 * The Worker is one shared, non-departmental principal; honestly reflects
 * that trust model rather than pretending a per-Worker restriction exists
 * (resolves OD-30: the Worker may read any Job by id, claimed or not).
 */
export async function findJobById(
  jobId: string,
): Promise<SafeJobDetail | null> {
  const row = await db.job.findUnique({
    where: { id: jobId },
    select: SAFE_JOB_DETAIL_SELECT,
  });
  return row ? toSafeJobDetail(row) : null;
}

export interface ListJobsFilters {
  state?: JobState;
  q?: string;
  page: number;
  pageSize: number;
}

export async function listJobs(
  actor: Actor,
  filters: ListJobsFilters,
): Promise<Paginated<SafeJob>> {
  const where: Prisma.JobWhereInput = {
    ...departmentScopeFilter(actor),
    ...(filters.state ? { state: filters.state } : {}),
    ...(filters.q
      ? { title: { contains: filters.q, mode: "insensitive" as const } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.job.findMany({
      where,
      select: SAFE_JOB_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.job.count({ where }),
  ]);

  return {
    items: rows.map(toSafeJob),
    page: filters.page,
    pageSize: filters.pageSize,
    total,
  };
}

/**
 * Atomic claim (docs/domain/jobs.md "Worker claim", ADR-0029) — the direct
 * fix for legacy's non-atomic `find` → `save` `fetch`. A single `UPDATE ...
 * WHERE id = (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *` statement:
 * Postgres guarantees only one concurrent statement can lock and claim any
 * given `QUEUED` row, and `SKIP LOCKED` means a second, simultaneous caller
 * moves on to the next-oldest queued row instead of blocking on the first.
 * This can only be expressed with a raw query — Prisma's query builder has
 * no `SKIP LOCKED` support. Global, not department-scoped, oldest-first —
 * matches legacy's single shared queue (docs/domain/jobs.md "claim scope &
 * ordering" OPEN DECISION: FIFO by `createdAt` is what's implemented).
 */
export async function claimNextJobRow(): Promise<SafeJobDetail | null> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    UPDATE "jobs"
    SET "state" = 'CLAIMED', "claimedAt" = now(), "updatedAt" = now()
    WHERE "id" = (
      SELECT "id" FROM "jobs"
      WHERE "state" = 'QUEUED'
      ORDER BY "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id"
  `;
  const claimed = rows[0];
  if (!claimed) return null;

  const row = await db.job.findUniqueOrThrow({
    where: { id: claimed.id },
    select: SAFE_JOB_DETAIL_SELECT,
  });
  return toSafeJobDetail(row);
}

export interface TransitionExtraData {
  claimedAt?: Date;
  startedAt?: Date;
  renderedAt?: Date;
  deliveredAt?: Date;
  uploadedAt?: Date;
  errorReason?: string;
  canceledByUserId?: string;
  canceledAt?: Date;
  cancelReason?: string;
}

/**
 * The one place `Job.state` is ever written outside `createJobWithAssets`
 * and `claimNextJobRow`. A single `updateMany` with `state: { in: fromStates
 * }` in its `WHERE` is itself the atomicity guarantee (Postgres executes one
 * `UPDATE` as a single statement) — no explicit transaction needed, and no
 * separate read-then-write race window: if another caller already moved the
 * row out of `fromStates` (a Worker's own update racing a human's cancel,
 * docs/domain/jobs.md §45 "Cancel vs Worker"), `count` comes back `0` and
 * this returns `null` rather than silently overwriting a state nobody
 * expected to be current.
 */
export async function transitionJobRow(
  jobId: string,
  fromStates: readonly JobState[],
  toState: JobState,
  extra: TransitionExtraData = {},
): Promise<SafeJobDetail | null> {
  const result = await db.job.updateMany({
    where: { id: jobId, state: { in: [...fromStates] } },
    data: { state: toState, ...extra },
  });
  if (result.count === 0) return null;

  const row = await db.job.findUniqueOrThrow({
    where: { id: jobId },
    select: SAFE_JOB_DETAIL_SELECT,
  });
  return toSafeJobDetail(row);
}

/** Worker-facing — no department scope, matches `transitionJobRow`'s reasoning. */
export async function setProgress(
  jobId: string,
  progress: number,
): Promise<SafeJobDetail | null> {
  const result = await db.job.updateMany({
    where: { id: jobId, state: { notIn: ["UPLOADED", "ERROR", "CANCELED"] } },
    data: { progress },
  });
  if (result.count === 0) return null;

  const row = await db.job.findUniqueOrThrow({
    where: { id: jobId },
    select: SAFE_JOB_DETAIL_SELECT,
  });
  return toSafeJobDetail(row);
}

/** Worker-facing — no department scope, matches `transitionJobRow`'s reasoning. */
export async function setDuration(
  jobId: string,
  durationSeconds: number,
): Promise<SafeJobDetail | null> {
  const result = await db.job.updateMany({
    where: { id: jobId, state: { notIn: ["UPLOADED", "ERROR", "CANCELED"] } },
    data: { durationSeconds },
  });
  if (result.count === 0) return null;

  const row = await db.job.findUniqueOrThrow({
    where: { id: jobId },
    select: SAFE_JOB_DETAIL_SELECT,
  });
  return toSafeJobDetail(row);
}

export interface CreateRetryData {
  originalJobId: string;
  departmentId: string;
  createdByUserId: string;
  templateId: string;
  snapshot: JobSnapshot;
  title: string;
  deliverToYouTube: boolean;
  attemptNumber: number;
  retriedByUserId: string;
  retryReason: string | null;
  assets: JobAssetData[];
}

/**
 * Non-destructive retry (ADR-0005, ADR-0031): the original Job row is never
 * read-then-written here — only ever selected earlier, by the use case, for
 * its eligibility check. `SELECT ... FOR UPDATE` on the original locks it for
 * the duration of this transaction, serializing concurrent retry attempts of
 * the *same* original (docs/domain/jobs.md §46 "Retry Idempotency") without
 * needing a generic idempotency-key framework: a second, simultaneous retry
 * of the same Job waits for the first to commit, then re-runs its own
 * eligibility/quota checks against the now-current state. Two *genuinely
 * simultaneous, duplicate* retry clicks can still each pass those checks and
 * produce two sibling retry Jobs — a client-side double-submit guard, not a
 * server invariant, is the intended defense against that (see ADR-0031).
 */
export async function createRetryJob(
  data: CreateRetryData,
): Promise<SafeJobDetail> {
  const row = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "jobs" WHERE id = ${data.originalJobId} FOR UPDATE`;

    if (data.deliverToYouTube) {
      await assertUploadQuotaAvailable(tx, new Date());
    }

    return tx.job.create({
      data: {
        departmentId: data.departmentId,
        createdByUserId: data.createdByUserId,
        templateId: data.templateId,
        snapshot: data.snapshot as unknown as Prisma.InputJsonValue,
        title: data.title,
        deliverToYouTube: data.deliverToYouTube,
        retryOfJobId: data.originalJobId,
        attemptNumber: data.attemptNumber,
        retriedByUserId: data.retriedByUserId,
        retryReason: data.retryReason,
        assets: {
          create: data.assets.map((asset, index) => ({
            ...asset,
            order: index,
          })),
        },
      },
      select: SAFE_JOB_DETAIL_SELECT,
    });
  });
  return toSafeJobDetail(row);
}

/**
 * Every JobAsset row (of any Job, in any state) that currently references
 * `fileId` **and** whose Job is in an active state. Powers the real
 * `assertNoActiveJobDependencies` (Phase 6 — `features/files/use-cases/
 * authorize-file-management.ts`). Unlike Templates' equivalent check, this
 * one *is* scoped to active Jobs only: once a Job leaves an active state its
 * `JobAsset` rows already carry every field the historical record needs
 * (copied at creation), so a since-completed/canceled/failed Job never blocks
 * a File's deletion — only a Job that might still actually read the file's
 * bytes does.
 */
export async function countActiveJobAssetReferencesToFile(
  fileId: string,
): Promise<number> {
  return db.jobAsset.count({
    where: {
      fileId,
      job: { state: { in: ["QUEUED", "CLAIMED", "RENDERING", "DELIVERING"] } },
    },
  });
}
