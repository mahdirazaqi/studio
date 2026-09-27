"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import {
  updateUserProfileSchema,
  updateUserProfileWithIdSchema,
} from "@/features/users/schemas/update-user-profile.schema";
import { updateUserProfile } from "@/features/users/use-cases/update-user-profile";

/**
 * Self-service profile edit (`/profile`) — never accepts a client-supplied
 * `userId`; the target is always the authenticated actor's own id, so a
 * crafted request can never edit anyone else through this action (the
 * use case's own `actor.userId === targetUserId` branch is what actually
 * enforces "self only" — this action just never gives it another id to
 * consider).
 */
export const updateOwnProfileAction = defineAction({
  name: "users.updateOwnProfile",
  input: updateUserProfileSchema,
  handler: async ({ input, actor }) => {
    const user = await updateUserProfile(actor, actor.userId, input);
    revalidatePath("/profile");
    return user;
  },
});

/**
 * MANAGER/ADMIN editing **another** user's basic profile (`/users/:id/edit`)
 * — `updateUserProfile` re-derives and re-checks everything
 * (department scope, role floor) from `actor`/the loaded target, never from
 * anything this action passes through unchecked.
 */
export const updateUserProfileAction = defineAction({
  name: "users.updateProfile",
  input: updateUserProfileWithIdSchema,
  handler: async ({ input, actor }) => {
    const { userId, ...profile } = input;
    const user = await updateUserProfile(actor, userId, profile);
    revalidatePath("/users");
    revalidatePath(`/users/${userId}/edit`);
    return user;
  },
});
