"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { createUserSchema } from "@/features/users/schemas/create-user.schema";
import { createUser } from "@/features/users/use-cases/create-user";

export const createUserAction = defineAction({
  name: "users.create",
  input: createUserSchema,
  handler: async ({ input, actor }) => {
    const user = await createUser(actor, input);
    revalidatePath("/users");
    return user;
  },
});
