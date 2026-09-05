import type {
  TemplateAssetKind,
  TemplateImageRatio,
} from "@/features/templates/domain/template";

/**
 * Pure invariants for a Template Asset slot definition
 * (docs/domain/templates.md "Template Asset", "Asset types", "Stable asset
 * identifiers"). Kept here — not inline in the Zod schema — so the rule is
 * unit-testable on its own and has exactly one definition shared by the
 * create/update schemas.
 */

export interface AssetKindConsistencyInput {
  kind: TemplateAssetKind;
  imageRatio?: TemplateImageRatio | null;
  defaultFileId?: string | null;
}

/** Only `IMAGE` slots carry an aspect-ratio expectation. */
export function requiresImageRatio(kind: TemplateAssetKind): boolean {
  return kind === "IMAGE";
}

/** `DATA` slots hold literal text — they can never default to a Gallery File. */
export function allowsFileReference(kind: TemplateAssetKind): boolean {
  return kind !== "DATA";
}

/**
 * Checks one asset's `kind` against its `imageRatio`/`defaultFileId` fields.
 * Returns field-keyed issue messages (empty object when the asset is
 * internally consistent) — shaped so a caller can attach each to the right
 * form field.
 */
export function checkAssetKindConsistency(asset: AssetKindConsistencyInput): {
  imageRatio?: string;
  defaultFileId?: string;
} {
  const issues: { imageRatio?: string; defaultFileId?: string } = {};

  if (requiresImageRatio(asset.kind)) {
    if (!asset.imageRatio) {
      issues.imageRatio = "Select an aspect ratio for image assets.";
    }
  } else if (asset.imageRatio) {
    issues.imageRatio = "Aspect ratio only applies to image assets.";
  }

  if (!allowsFileReference(asset.kind) && asset.defaultFileId) {
    issues.defaultFileId = "Data assets cannot reference a file.";
  }

  return issues;
}

/**
 * The first duplicated slot key in `assets`, or `null` if every key is
 * unique. Order-preserving so the error can point at the second (repeat)
 * occurrence's key value. Backs the `(templateId, key)` DB constraint with a
 * friendly, whole-list error before that constraint is ever reached.
 */
export function findDuplicateAssetKey(
  assets: readonly { key: string }[],
): string | null {
  const seen = new Set<string>();
  for (const asset of assets) {
    if (seen.has(asset.key)) return asset.key;
    seen.add(asset.key);
  }
  return null;
}
