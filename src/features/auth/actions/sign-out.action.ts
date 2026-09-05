"use server";

import { defineAction } from "@/server/actions";
import {
  clearSessionCookie,
  getSessionTokenFromCookies,
} from "@/server/auth/session";
import { signOut } from "@/features/auth/use-cases/sign-out";

/**
 * Sign out. `auth: "public"` deliberately — signing out must succeed even
 * against an already-expired/invalid session (the goal is "no session
 * afterwards", which is already true in that case).
 */
export const signOutAction = defineAction({
  name: "auth.signOut",
  auth: "public",
  handler: async () => {
    const token = await getSessionTokenFromCookies();
    await signOut(token);
    await clearSessionCookie();
    return { redirectTo: "/sign-in" };
  },
});
