import "server-only";

import type { z } from "zod";

import { requireUser } from "@/server/auth/current-user";
import { toActor, type Actor } from "@/server/authz";
import { toPublicError, type PublicError } from "@/server/errors";
import { parseInput } from "@/server/validation";
import { logger } from "@/server/logger";

/**
 * SERVER ACTIONS CONVENTION.
 *
 * Every internal mutation is a Server Action. Actions are thin: they validate
 * input, resolve the actor, and delegate to a use case. They never contain
 * business rules and never touch the database directly.
 *
 * Flow:  input -> validate (Zod) -> authenticate -> (use case authorizes) -> result
 *
 * An action always returns an `ActionResult<T>` — it never throws to the
 * client. Field-level validation errors come back in `error.fieldErrors`.
 *
 * Usage:
 *   "use server";
 *   export const createThing = defineAction({
 *     input: createThingSchema,          // optional
 *     auth: "required",                  // "required" (default) | "public"
 *     handler: async ({ input, actor }) => useCases.createThing(actor, input),
 *   });
 */

export type ActionResult<T> =
  { ok: true; data: T } | { ok: false; error: PublicError };

export function actionOk<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

type AuthMode = "required" | "public";

interface DefineActionConfig<TInput, TOutput, TAuth extends AuthMode> {
  /** Zod schema for the action input. Omit for actions that take no input. */
  input?: z.ZodType<TInput>;
  /** Whether a signed-in user is required. Defaults to `"required"`. */
  auth?: TAuth;
  /** A short name for logs (defaults to a generic label). */
  name?: string;
  handler: (ctx: {
    input: TInput;
    actor: TAuth extends "public" ? Actor | null : Actor;
  }) => Promise<TOutput>;
}

type ActionFn<TInput, TOutput> = [TInput] extends [undefined | void]
  ? () => Promise<ActionResult<TOutput>>
  : (input: TInput) => Promise<ActionResult<TOutput>>;

export function defineAction<
  TOutput,
  TInput = undefined,
  TAuth extends AuthMode = "required",
>(
  config: DefineActionConfig<TInput, TOutput, TAuth>,
): ActionFn<TInput, TOutput> {
  const name = config.name ?? "action";
  const authMode: AuthMode = config.auth ?? "required";

  const run = async (rawInput?: TInput): Promise<ActionResult<TOutput>> => {
    const log = logger.child({ action: name });
    try {
      log.debug("action invoked");
      const input = (
        config.input ? parseInput(config.input, rawInput) : rawInput
      ) as TInput;

      let actor: Actor | null = null;
      if (authMode === "required") {
        actor = toActor(await requireUser());
      } else {
        const { getCurrentUser } = await import("@/server/auth/current-user");
        const user = await getCurrentUser();
        actor = user ? toActor(user) : null;
      }

      const data = await config.handler({
        input,
        actor: actor as TAuth extends "public" ? Actor | null : Actor,
      });
      return { ok: true, data };
    } catch (error) {
      return { ok: false, error: toPublicError(error, { action: name }) };
    }
  };

  return run as ActionFn<TInput, TOutput>;
}
