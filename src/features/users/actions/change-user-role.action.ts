"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { changeUserRoleSchema } from "@/features/users/schemas/change-user-role.schema";
import { changeUserRole } from "@/features/users/use-cases/change-user-role";

export const changeUserRoleAction = defineAction({
  name: "users.changeRole",
  input: changeUserRoleSchema,
  handler: async ({ input, actor }) => {
    const user = await changeUserRole(actor, input.userId, input.role);
    revalidatePath("/users");
    return user;
  },
});
