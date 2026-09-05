import { unauthenticatedError } from "@/server/errors/app-error";
import {
  verifyPassword,
  UNKNOWN_USER_DUMMY_HASH,
} from "@/server/auth/password";
import { createSession, type IssuedSession } from "@/server/auth/session";
import { findUserCredentialByEmail } from "@/features/users/repository/user-repository";
import type { SignInInput } from "@/features/auth/schemas/sign-in.schema";

/**
 * Verify credentials and, on success, issue a session.
 *
 * Failure is intentionally a single generic error for every cause — unknown
 * email, wrong password, or a disabled account (docs/architecture/
 * authentication.md, security.md §1 "avoid overly specific errors"). This
 * also means a disabled user gets the same message as a wrong password: a
 * deliberate choice not to reveal account existence or status.
 *
 * `verifyPassword` always runs, even when no user was found, against a fixed
 * dummy hash — see `UNKNOWN_USER_DUMMY_HASH` for why (timing side channel).
 */
export async function signIn(input: SignInInput): Promise<IssuedSession> {
  const user = await findUserCredentialByEmail(input.email);

  const passwordIsValid = await verifyPassword(
    input.password,
    user?.passwordHash ?? UNKNOWN_USER_DUMMY_HASH,
  );

  if (!user || !passwordIsValid || user.status !== "ACTIVE") {
    throw unauthenticatedError("Invalid email or password.");
  }

  return createSession(user.id);
}
