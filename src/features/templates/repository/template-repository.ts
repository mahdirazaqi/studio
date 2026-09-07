import "server-only";

import { Prisma } from "@prisma/client";

import { db } from "@/server/db";
import { conflictError } from "@/server/errors/app-error";
import { departmentScopeFilter, type Actor } from "@/server/authz";
import type { Paginated } from "@/types";
import type {
  SafeTemplate,
  SafeTemplateAsset,
  SafeTemplateDetail,
  TemplateAssetKind,
  TemplateImageRatio,
  TemplateStatus,
} from "@/features/templates/domain/template";

/**
 * The only module that queries the `Template`/`TemplateAsset` tables — every
 * read applies `departmentScopeFilter(actor)`, mirroring
 * `features/files/repository/file-repository.ts`.
 */

const SAFE_TEMPLATE_SELECT = {
  id: true,
  departmentId: true,
  name: true,
  status: true,
  deletedAt: true,
  createdByUserId: true,
  createdBy: { select: { fullName: true } },
  createdAt: true,
  updatedAt: true,
  _count: { select: { assets: true } },
} satisfies Prisma.TemplateSelect;

type SafeTemplateRow = Prisma.TemplateGetPayload<{
  select: typeof SAFE_TEMPLATE_SELECT;
}>;

function toSafeTemplate(row: SafeTemplateRow): SafeTemplate {
  return {
    id: row.id,
    departmentId: row.departmentId,
    name: row.name,
    status: row.status,
    deletedAt: row.deletedAt,
    assetCount: row._count.assets,
    createdByUserId: row.createdByUserId,
    createdByName: row.createdBy?.fullName ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const SAFE_TEMPLATE_DETAIL_SELECT = {
  ...SAFE_TEMPLATE_SELECT,
  composition: true,
  source: true,
  scriptRef: true,
  outputPattern: true,
  description: true,
  tags: true,
  youtubeTargetId: true,
  assets: {
    select: {
      id: true,
      key: true,
      kind: true,
      composition: true,
      layer: true,
      imageRatio: true,
      defaultFileId: true,
      order: true,
    },
    orderBy: { order: "asc" },
  },
} satisfies Prisma.TemplateSelect;

type SafeTemplateDetailRow = Prisma.TemplateGetPayload<{
  select: typeof SAFE_TEMPLATE_DETAIL_SELECT;
}>;

function toSafeTemplateDetail(row: SafeTemplateDetailRow): SafeTemplateDetail {
  return {
    ...toSafeTemplate(row),
    composition: row.composition,
    source: row.source,
    scriptRef: row.scriptRef,
    outputPattern: row.outputPattern,
    description: row.description,
    tags: row.tags,
    youtubeTargetId: row.youtubeTargetId,
    assets: row.assets.map((asset): SafeTemplateAsset => ({
      id: asset.id,
      key: asset.key,
      kind: asset.kind,
      composition: asset.composition,
      layer: asset.layer,
      imageRatio: asset.imageRatio,
      defaultFileId: asset.defaultFileId,
      order: asset.order,
    })),
  };
}

export interface TemplateAssetData {
  key: string;
  kind: TemplateAssetKind;
  composition: string;
  layer: string;
  imageRatio: TemplateImageRatio | null;
  defaultFileId: string | null;
}

export interface CreateTemplateData {
  departmentId: string;
  createdByUserId: string;
  name: string;
  composition: string;
  source: string;
  scriptRef: string;
  outputPattern: string;
  description: string | null;
  tags: string[];
  youtubeTargetId: string | null;
  assets: TemplateAssetData[];
}

/** True when `error` is a Postgres unique-constraint violation (P2002). */
function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

const DUPLICATE_NAME_MESSAGE = (name: string) =>
  `A template named "${name}" already exists in this department.`;

export async function createTemplateWithAssets(
  data: CreateTemplateData,
): Promise<SafeTemplateDetail> {
  try {
    const row = await db.template.create({
      data: {
        departmentId: data.departmentId,
        createdByUserId: data.createdByUserId,
        name: data.name,
        composition: data.composition,
        source: data.source,
        scriptRef: data.scriptRef,
        outputPattern: data.outputPattern,
        description: data.description,
        tags: data.tags,
        youtubeTargetId: data.youtubeTargetId,
        assets: {
          create: data.assets.map((asset, index) => ({
            key: asset.key,
            kind: asset.kind,
            composition: asset.composition,
            layer: asset.layer,
            imageRatio: asset.imageRatio,
            defaultFileId: asset.defaultFileId,
            order: index,
          })),
        },
      },
      select: SAFE_TEMPLATE_DETAIL_SELECT,
    });
    return toSafeTemplateDetail(row);
  } catch (error) {
    // A raw Postgres unique-violation (either the partial `(departmentId,
    // name) WHERE deletedAt IS NULL` index, ADR-0027, or — defensively — the
    // `(templateId, key)` asset constraint, though that one is already
    // pre-checked by `findDuplicateAssetKey` before this is ever called) is
    // translated to a clean, safe error here rather than surfaced to a use
    // case as a Prisma-specific type. This is data-access error
    // normalization, not a business decision, so it stays in the repository —
    // the same reasoning `local-storage-adapter.ts` documents for translating
    // filesystem errors at its own boundary.
    if (isUniqueConstraintError(error)) {
      throw conflictError(DUPLICATE_NAME_MESSAGE(data.name));
    }
    throw error;
  }
}

export interface UpdateTemplateData {
  templateId: string;
  /** ADMIN-only transfer (docs/domain/templates.md "Department transfer",
   * ADR-0040) — the use case only ever sets this to a value different from
   * the Template's current department when the actor is ADMIN and the
   * target department was validated to exist; every other caller passes the
   * existing, unchanged department id straight through. */
  departmentId: string;
  name: string;
  composition: string;
  source: string;
  scriptRef: string;
  outputPattern: string;
  description: string | null;
  tags: string[];
  youtubeTargetId: string | null;
  assets: TemplateAssetData[];
}

/**
 * Full-replace update: the Template's scalar fields plus its entire asset
 * list, atomically. Assets are always replaced wholesale rather than diffed
 * (docs/domain/templates.md "Updating Template assets") — safe because a
 * Template's live configuration never needs row-level continuity for a
 * historical Job, which will hold its own immutable snapshot (ADR-0010).
 */
export async function updateTemplateWithAssets(
  data: UpdateTemplateData,
): Promise<SafeTemplateDetail> {
  try {
    const row = await db.$transaction(async (tx) => {
      await tx.templateAsset.deleteMany({
        where: { templateId: data.templateId },
      });
      return tx.template.update({
        where: { id: data.templateId },
        data: {
          departmentId: data.departmentId,
          name: data.name,
          composition: data.composition,
          source: data.source,
          scriptRef: data.scriptRef,
          outputPattern: data.outputPattern,
          description: data.description,
          tags: data.tags,
          youtubeTargetId: data.youtubeTargetId,
          assets: {
            create: data.assets.map((asset, index) => ({
              key: asset.key,
              kind: asset.kind,
              composition: asset.composition,
              layer: asset.layer,
              imageRatio: asset.imageRatio,
              defaultFileId: asset.defaultFileId,
              order: index,
            })),
          },
        },
        select: SAFE_TEMPLATE_DETAIL_SELECT,
      });
    });
    return toSafeTemplateDetail(row);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw conflictError(DUPLICATE_NAME_MESSAGE(data.name));
    }
    throw error;
  }
}

/**
 * Load a Template the actor is allowed to see, or `null` for both "doesn't
 * exist" and "exists in another department" (docs/architecture/authorization.md
 * 403-vs-404 guidance). Deliberately includes soft-deleted rows — a direct
 * link to a since-deleted Template still resolves to its record rather than a
 * bare 404, matching "remains resolvable ... in admin views"
 * (docs/domain/templates.md); the use-case layer decides what mutations a
 * deleted/disabled Template still permits.
 */
export async function findTemplateInScope(
  actor: Actor,
  templateId: string,
): Promise<SafeTemplateDetail | null> {
  const row = await db.template.findFirst({
    where: { id: templateId, ...departmentScopeFilter(actor) },
    select: SAFE_TEMPLATE_DETAIL_SELECT,
  });
  return row ? toSafeTemplateDetail(row) : null;
}

export interface ListTemplatesFilters {
  status?: TemplateStatus;
  q?: string;
  page: number;
  pageSize: number;
}

/** Normal list queries always exclude soft-deleted rows (Phase 5 brief §19). */
export async function listTemplates(
  actor: Actor,
  filters: ListTemplatesFilters,
): Promise<Paginated<SafeTemplate>> {
  const where: Prisma.TemplateWhereInput = {
    ...departmentScopeFilter(actor),
    deletedAt: null,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.q
      ? { name: { contains: filters.q, mode: "insensitive" as const } }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.template.findMany({
      where,
      select: SAFE_TEMPLATE_SELECT,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    db.template.count({ where }),
  ]);

  return {
    items: rows.map(toSafeTemplate),
    page: filters.page,
    pageSize: filters.pageSize,
    total,
  };
}

export async function setTemplateStatus(
  templateId: string,
  status: TemplateStatus,
): Promise<void> {
  await db.template.update({ where: { id: templateId }, data: { status } });
}

export async function softDeleteTemplate(
  templateId: string,
  deletedByUserId: string,
): Promise<void> {
  await db.template.update({
    where: { id: templateId },
    data: { deletedAt: new Date(), deletedByUserId },
  });
}

/**
 * Every TemplateAsset row (of any Template, deleted or not) that currently
 * defaults to `fileId`. The File-deletion use case
 * (`features/files/use-cases/authorize-file-management.ts`,
 * `assertNoActiveTemplateDependencies`) calls this *before* attempting the
 * delete, so a File the Restrict FK would refuse to remove is never even
 * tried — the caller never sees a raw Prisma foreign-key error.
 *
 * Deliberately not scoped to non-deleted Templates only: `defaultFileId`'s
 * `onDelete: Restrict` FK is enforced regardless of the referencing
 * Template's soft-delete state, so this check must match that exactly or the
 * caller could still hit a raw DB error after a "safe to delete" answer.
 */
export async function countTemplateAssetReferencesToFile(
  fileId: string,
): Promise<number> {
  return db.templateAsset.count({ where: { defaultFileId: fileId } });
}
