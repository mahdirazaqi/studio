import "server-only";

import { NextResponse } from "next/server";
import type { z } from "zod";

import { toPublicError, type PublicError } from "@/server/errors";
import { AppError } from "@/server/errors/app-error";
import { parseInput } from "@/server/validation";
import { logger } from "@/server/logger";

/**
 * REST ROUTE HANDLER CONVENTION.
 *
 * Route Handlers under `src/app/api/**` exist ONLY for external clients that
 * need a stable HTTP contract — primarily the Render Worker (later the Telegram
 * webhook). Internal UI never uses REST; it uses Server Actions / Server
 * Components.
 *
 * Flow:  request -> authenticate (service credential / webhook secret)
 *                -> validate (Zod) -> use case -> JSON response
 *
 * A handler is thin: parse + authenticate + validate + delegate + map result.
 * No business logic here.
 *
 * The actual Worker/Telegram endpoints are NOT implemented in Phase 1 — this
 * module only establishes the shape they will use.
 */

const REQUEST_ID_HEADER = "x-request-id";

export interface ApiContext<TBody, TQuery, TParams> {
  request: Request;
  body: TBody;
  query: TQuery;
  params: TParams;
  requestId: string;
  log: ReturnType<typeof logger.child>;
}

type RouteParams = Record<string, string | string[] | undefined>;

interface DefineRouteHandlerConfig<TBody, TQuery, TParams, TResult> {
  /** Short name for logs, e.g. `worker.jobs.claim`. */
  name: string;
  /** Zod schema for the JSON request body. */
  body?: z.ZodType<TBody>;
  /** Zod schema for URL search params. */
  query?: z.ZodType<TQuery>;
  /** Zod schema for the dynamic route params. */
  params?: z.ZodType<TParams>;
  /**
   * Authenticate the caller. Throw an `AppError` (`unauthenticated` /
   * `forbidden`) to reject. Return value is ignored. Required — there is no
   * such thing as an unauthenticated external endpoint in Studio.
   */
  authenticate: (request: Request) => Promise<void> | void;
  handler: (
    ctx: ApiContext<TBody, TQuery, TParams>,
  ) => Promise<TResult> | TResult;
  /** HTTP status for a successful response. Defaults to 200. */
  successStatus?: number;
}

function errorResponse(
  error: PublicError,
  requestId: string,
  status: number,
): NextResponse {
  return NextResponse.json(
    { error, requestId },
    { status, headers: { [REQUEST_ID_HEADER]: requestId } },
  );
}

/**
 * Build a typed App Router route handler (`export const POST = defineRouteHandler(...)`).
 */
export function defineRouteHandler<
  TResult,
  TBody = undefined,
  TQuery = undefined,
  TParams = undefined,
>(config: DefineRouteHandlerConfig<TBody, TQuery, TParams, TResult>) {
  return async (
    request: Request,
    routeCtx: { params: Promise<RouteParams> },
  ): Promise<NextResponse> => {
    const requestId =
      request.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
    const log = logger.child({
      route: config.name,
      requestId,
      method: request.method,
    });

    try {
      await config.authenticate(request);

      const rawParams = routeCtx?.params ? await routeCtx.params : {};
      const params = (
        config.params ? parseInput(config.params, rawParams) : rawParams
      ) as TParams;

      const url = new URL(request.url);
      const rawQuery = Object.fromEntries(url.searchParams.entries());
      const query = (
        config.query ? parseInput(config.query, rawQuery) : rawQuery
      ) as TQuery;

      let body = undefined as TBody;
      if (config.body) {
        const json = await request
          .json()
          .catch(() => ({}) as Record<string, unknown>);
        body = parseInput(config.body, json);
      }

      const result = await config.handler({
        request,
        body,
        query,
        params,
        requestId,
        log,
      });

      const status = config.successStatus ?? 200;
      if (status === 204 || result === undefined || result === null) {
        return new NextResponse(null, {
          status: 204,
          headers: { [REQUEST_ID_HEADER]: requestId },
        });
      }
      return NextResponse.json(result, {
        status,
        headers: { [REQUEST_ID_HEADER]: requestId },
      });
    } catch (error) {
      const publicError = toPublicError(error, {
        route: config.name,
        requestId,
      });
      const status = AppError.isAppError(error) ? error.httpStatus : 500;
      return errorResponse(publicError, requestId, status);
    }
  };
}

/** Health/readiness responses — no domain data. */
export function healthResponse(body: Record<string, unknown>): NextResponse {
  return NextResponse.json(body, {
    status: 200,
    headers: { "cache-control": "no-store" },
  });
}
