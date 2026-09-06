"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { createDepartmentSchema } from "@/features/departments/schemas/department-input.schema";
import { createDepartment } from "@/features/departments/use-cases/create-department";

export const createDepartmentAction = defineAction({
  name: "departments.create",
  input: createDepartmentSchema,
  handler: async ({ input, actor }) => {
    const department = await createDepartment(actor, input.name);
    revalidatePath("/departments");
    return department;
  },
});
