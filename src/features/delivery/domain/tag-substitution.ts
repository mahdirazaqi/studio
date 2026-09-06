/**
 * YouTube tag `{{layer}}` substitution (docs/integrations/youtube.md "Tags").
 * Pure — no I/O, no Prisma import (mirrors every other feature's `domain/`).
 *
 * Legacy (`JobService.processTags`): for every `data`-kind asset, replace a
 * `{{<layer>}}` placeholder in the Template's tag list with that asset's
 * literal value; any tag still containing an unresolved `{{...}}` afterward
 * is dropped (a misconfigured Template produces fewer tags, never an error).
 * Studio keeps exactly that outcome and deliberately drops legacy's
 * `excludeTags` set (`{{album}}`/`{{song}}`/`{{artist}}`) — dead code with no
 * documented purpose (docs/integrations/youtube.md "Tags").
 */
export interface TagDataAsset {
  layer: string | null;
  textValue: string | null;
}

const UNRESOLVED_PLACEHOLDER = /\{\{[^}]+\}\}/;

export function substituteTags(
  templateTags: readonly string[],
  dataAssets: readonly TagDataAsset[],
): string[] {
  let tags: string[] = [...templateTags];

  for (const asset of dataAssets) {
    if (!asset.layer || asset.textValue === null) continue;
    const placeholder = `{{${asset.layer}}}`;
    tags = tags.map((tag) => (tag === placeholder ? asset.textValue! : tag));
  }

  const deduped = [...new Set(tags)];
  return deduped.filter((tag) => !UNRESOLVED_PLACEHOLDER.test(tag));
}
