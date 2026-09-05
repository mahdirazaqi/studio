"use server";

import { defineAction } from "@/server/actions";
import { setSessionCookie } from "@/server/auth/session";
import { signInSchema } from "@/features/auth/schemas/sign-in.schema";
import { signIn } from "@/features/auth/use-cases/sign-in";

/**
 * Sign in with email + password.
 *
 * `auth: "public"` — there is no session yet when this runs. On success the
 * handler sets the session cookie itself (cookie writes are only valid inside
 * a Server Action / Route Handler, not in the use case — see
 * docs/architecture/project-structure.md: use cases never import `next/*`
 * request APIs). The client redirects on `result.ok`; this action does not
 * call `redirect()` itself so a thrown `AppError` still reaches the client as
 * a normal `{ ok: false }` result instead of being mistaken for a navigation.
 */
export const signInAction = defineAction({
  name: "auth.signIn",
  input: signInSchema,
  auth: "public",
  handler: async ({ input }) => {
    const session = await signIn(input);
    await setSessionCookie(session);
    return { redirectTo: "/" };
  },
});
