"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { renameDepartmentSchema } from "@/features/departments/schemas/department-input.schema";
import { renameDepartment } from "@/features/departments/use-cases/rename-department";

export const renameDepartmentAction = defineAction({
  name: "departments.rename",
  input: renameDepartmentSchema,
  handler: async ({ input, actor }) => {
    const department = await renameDepartment(
      actor,
      input.departmentId,
      input.name,
    );
    revalidatePath("/departments");
    return department;
  },
});
