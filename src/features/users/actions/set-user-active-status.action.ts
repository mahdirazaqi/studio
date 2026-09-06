"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { userIdParamSchema } from "@/features/users/schemas/user-id-param.schema";
import {
  disableUser,
  enableUser,
} from "@/features/users/use-cases/set-user-active-status";

export const enableUserAction = defineAction({
  name: "users.enable",
  input: userIdParamSchema,
  handler: async ({ input, actor }) => {
    const user = await enableUser(actor, input.userId);
    revalidatePath("/users");
    return user;
  },
});

export const disableUserAction = defineAction({
  name: "users.disable",
  input: userIdParamSchema,
  handler: async ({ input, actor }) => {
    const user = await disableUser(actor, input.userId);
    revalidatePath("/users");
    return user;
  },
});
