import { z } from "zod";

import { validationError, type FieldErrors } from "@/server/errors/app-error";

/**
 * Input validation at trust boundaries.
 *
 * Every Server Action, Route Handler, and (later) Telegram/Worker input is
 * parsed through a Zod schema with `parseInput`. Browser and network input is
 * never trusted directly.
 *
 * Keep schemas next to the feature that owns them
 * (`src/features/<feature>/schemas/`). This module only provides the reusable
 * parsing + error-shaping helpers and a few primitives.
 */

/** Flatten a ZodError into `{ "path.to.field": ["message", ...] }`. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const fieldErrors: FieldErrors = {};
  for (const issue of error.issues) {
    const path = issue.path.length ? issue.path.join(".") : "_root";
    (fieldErrors[path] ??= []).push(issue.message);
  }
  return fieldErrors;
}

/**
 * Parse `data` against `schema`. On success returns the typed value; on failure
 * throws a `validation` `AppError` carrying field-level messages.
 */
export function parseInput<TSchema extends z.ZodType>(
  schema: TSchema,
  data: unknown,
): z.output<TSchema> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  throw validationError("The submitted data is invalid.", {
    fieldErrors: toFieldErrors(result.error),
  });
}

/** Non-throwing variant for call sites that want to branch on the result. */
export function safeParseInput<TSchema extends z.ZodType>(
  schema: TSchema,
  data: unknown,
):
  | { ok: true; data: z.output<TSchema> }
  | { ok: false; fieldErrors: FieldErrors } {
  const result = schema.safeParse(data);
  return result.success
    ? { ok: true, data: result.data }
    : { ok: false, fieldErrors: toFieldErrors(result.error) };
}

/** Common reusable primitives. Extend as the domain needs them. */
export const commonSchemas = {
  /** Trimmed non-empty string with an upper bound. */
  shortText: z.string().trim().min(1).max(255),
  /** Trimmed optional longer text. */
  longText: z.string().trim().max(10_000),
  /** A CUID/opaque id string — format tightened when the DB layer lands. */
  id: z.string().min(1).max(64),
  /** 1-based pagination. */
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
};
