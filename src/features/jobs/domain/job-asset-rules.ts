/**
 * Pure invariants for the Job asset values submitted at creation. Small and
 * self-contained rather than importing `features/templates/domain/
 * template-asset-rules.ts`'s equivalent `findDuplicateAssetKey` — each
 * feature's domain layer stays independent (it imports nothing, per
 * docs/architecture/project-structure.md), even though the one-line
 * algorithm is identical.
 */
export function findDuplicateSlotKey(
  assets: readonly { slotKey: string }[],
): string | null {
  const seen = new Set<string>();
  for (const asset of assets) {
    if (seen.has(asset.slotKey)) return asset.slotKey;
    seen.add(asset.slotKey);
  }
  return null;
}
