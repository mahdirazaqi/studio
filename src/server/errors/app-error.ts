/**
 * Application error model.
 *
 * One error class, discriminated by `kind`. Use cases and boundary code throw
 * these; transports (Server Actions, Route Handlers) map them to a safe shape
 * for the client. Anything that is not an `AppError` is treated as an
 * unexpected internal error and its details are never sent to the client.
 *
 * Keep this small. Add a `kind` only when a caller needs to react differently.
 */

export const ERROR_KINDS = [
  "validation", // input failed a schema / precondition — 422 / 400
  "unauthenticated", // no valid session / credential — 401
  "forbidden", // authenticated but not allowed — 403
  "not_found", // resource does not exist (or is hidden) — 404
  "conflict", // state/uniqueness conflict — 409
  "rate_limited", // too many requests — 429
  "business_rule", // a domain rule rejected the operation — 422
  "dependency", // a downstream/external dependency failed — 502 / 503
  "internal", // unexpected — 500
] as const;

export type ErrorKind = (typeof ERROR_KINDS)[number];

const STATUS_BY_KIND: Record<ErrorKind, number> = {
  validation: 422,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  business_rule: 422,
  dependency: 503,
  internal: 500,
};

/** Field-level validation messages, keyed by dotted field path. */
export type FieldErrors = Record<string, string[]>;

export interface AppErrorOptions {
  /** Stable machine-readable code, e.g. `job.not_found`. Safe to expose. */
  code?: string;
  /** Field-level messages for `validation` errors. Safe to expose. */
  fieldErrors?: FieldErrors;
  /** Extra safe-to-expose context (no secrets, no internals). */
  details?: Record<string, unknown>;
  /** The underlying error, kept for logging only — never sent to the client. */
  cause?: unknown;
}

export class AppError extends Error {
  readonly kind: ErrorKind;
  readonly httpStatus: number;
  readonly code: string;
  readonly fieldErrors?: FieldErrors;
  readonly details?: Record<string, unknown>;
  /** True when the message is written for end users and safe to display. */
  readonly expose: boolean;

  constructor(kind: ErrorKind, message: string, options: AppErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : {});
    this.name = "AppError";
    this.kind = kind;
    this.httpStatus = STATUS_BY_KIND[kind];
    this.code = options.code ?? kind;
    this.fieldErrors = options.fieldErrors;
    this.details = options.details;
    this.expose = kind !== "internal";
  }

  static isAppError(value: unknown): value is AppError {
    return value instanceof AppError;
  }
}

/* Convenience constructors — prefer these over `new AppError(...)`. */

export const validationError = (
  message = "The submitted data is invalid.",
  options?: AppErrorOptions,
) => new AppError("validation", message, options);

export const unauthenticatedError = (
  message = "You must be signed in to do that.",
  options?: AppErrorOptions,
) => new AppError("unauthenticated", message, options);

export const forbiddenError = (
  message = "You do not have permission to do that.",
  options?: AppErrorOptions,
) => new AppError("forbidden", message, options);

export const notFoundError = (
  message = "The requested resource was not found.",
  options?: AppErrorOptions,
) => new AppError("not_found", message, options);

export const conflictError = (
  message = "That change conflicts with the current state.",
  options?: AppErrorOptions,
) => new AppError("conflict", message, options);

export const rateLimitedError = (
  message = "Too many requests. Please try again shortly.",
  options?: AppErrorOptions,
) => new AppError("rate_limited", message, options);

export const businessRuleError = (message: string, options?: AppErrorOptions) =>
  new AppError("business_rule", message, options);

export const dependencyError = (
  message = "A required service is currently unavailable.",
  options?: AppErrorOptions,
) => new AppError("dependency", message, options);

export const internalError = (
  message = "Something went wrong on our end.",
  options?: AppErrorOptions,
) => new AppError("internal", message, options);
