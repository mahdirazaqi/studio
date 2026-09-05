/**
 * Shared, framework-agnostic types used across features. Client-safe.
 *
 * Domain types live with their feature (`src/features/<feature>/types`). Only
 * put a type here when it is genuinely cross-cutting.
 */

/** A value that may still be loading / absent. */
export type Maybe<T> = T | null | undefined;

/** Standard paginated list envelope for read models. */
export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/** Discriminated result type for operations that can fail without throwing. */
export type Result<T, E = string> =
  { ok: true; value: T } | { ok: false; error: E };
