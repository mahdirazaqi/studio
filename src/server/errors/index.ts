import { logger } from "@/server/logger";

import {
  AppError,
  internalError,
  type ErrorKind,
  type FieldErrors,
} from "./app-error";

export * from "./app-error";

/**
 * The client-safe representation of an error. This is the only error shape that
 * ever crosses a trust boundary (Server Action result, Route Handler body).
 * It never contains a stack trace, a `cause`, SQL, secrets, or internal paths.
 */
export interface PublicError {
  kind: ErrorKind;
  /** Machine-readable, stable. */
  code: string;
  /** Human-readable, English, safe to display. */
  message: string;
  fieldErrors?: FieldErrors;
  details?: Record<string, unknown>;
}

const GENERIC_INTERNAL_MESSAGE = "Something went wrong. Please try again.";

/**
 * Normalize any thrown value into an `AppError`. Unknown errors become an
 * opaque `internal` error; the original is attached as `cause` for logging.
 */
export function toAppError(error: unknown): AppError {
  if (AppError.isAppError(error)) return error;
  return internalError(GENERIC_INTERNAL_MESSAGE, { cause: error });
}

/**
 * Convert any thrown value into a `PublicError` and log it with the right
 * severity. `internal` errors are logged at `error` with full detail but the
 * returned message is always generic.
 */
export function toPublicError(
  error: unknown,
  context?: Record<string, unknown>,
): PublicError {
  const appError = toAppError(error);

  if (appError.kind === "internal") {
    logger.error("Unhandled error", {
      ...context,
      code: appError.code,
      cause: appError.cause ?? appError,
    });
    return {
      kind: "internal",
      code: "internal",
      message: GENERIC_INTERNAL_MESSAGE,
    };
  }

  logger.warn("Handled application error", {
    ...context,
    kind: appError.kind,
    code: appError.code,
    message: appError.message,
  });

  return {
    kind: appError.kind,
    code: appError.code,
    message: appError.expose ? appError.message : GENERIC_INTERNAL_MESSAGE,
    ...(appError.fieldErrors ? { fieldErrors: appError.fieldErrors } : {}),
    ...(appError.details ? { details: appError.details } : {}),
  };
}
