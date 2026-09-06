/**
 * Legacy rule, kept (docs/domain/jobs.md "Fields" — `title`): join every
 * `DATA`-kind asset's literal value, in Template slot order, with `" | "`.
 * Computed once at Job creation and stored — never recomputed, so a later
 * Template edit can never change a historical Job's title.
 */
export function buildJobTitle(dataAssetValues: readonly string[]): string {
  return dataAssetValues.join(" | ");
}
