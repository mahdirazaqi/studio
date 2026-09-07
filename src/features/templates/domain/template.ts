/**
 * Pure domain types for the Template feature. No I/O, no Prisma import
 * (mirrors `features/files/domain/file.ts`) — see
 * docs/architecture/project-structure.md "Layer responsibilities".
 */

export const TEMPLATE_STATUSES = ["ACTIVE", "DISABLED"] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export const TEMPLATE_ASSET_KINDS = [
  "DATA",
  "IMAGE",
  "AUDIO",
  "VIDEO",
] as const;
export type TemplateAssetKind = (typeof TEMPLATE_ASSET_KINDS)[number];

export const TEMPLATE_IMAGE_RATIOS = [
  "PORTRAIT_9_16",
  "LANDSCAPE_16_9",
  "SQUARE",
  "ANY",
] as const;
export type TemplateImageRatio = (typeof TEMPLATE_IMAGE_RATIOS)[number];

/**
 * A Template's actual lifecycle state, computed from the two independent
 * `status`/`deletedAt` columns (docs/domain/templates.md "Lifecycle") — never
 * stored as a single field. `DELETED` always wins regardless of `status`.
 */
export type TemplateLifecycleState = "ACTIVE" | "DISABLED" | "DELETED";

export function templateLifecycleState(template: {
  status: TemplateStatus;
  deletedAt: Date | null;
}): TemplateLifecycleState {
  if (template.deletedAt) return "DELETED";
  return template.status;
}

export interface SafeTemplateAsset {
  id: string;
  key: string;
  kind: TemplateAssetKind;
  composition: string;
  layer: string;
  imageRatio: TemplateImageRatio | null;
  defaultFileId: string | null;
  order: number;
}

/** List-view shape — no assets, cheap to page through. */
export interface SafeTemplate {
  id: string;
  departmentId: string;
  name: string;
  status: TemplateStatus;
  deletedAt: Date | null;
  assetCount: number;
  createdByUserId: string;
  createdByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Detail/edit shape — full configuration, including ordered assets. */
export interface SafeTemplateDetail extends SafeTemplate {
  composition: string;
  source: string;
  scriptRef: string;
  outputPattern: string;
  assets: SafeTemplateAsset[];
}
