"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { transferTemplateDepartmentSchema } from "@/features/templates/schemas/transfer-template-department.schema";
import { transferTemplateDepartment } from "@/features/templates/use-cases/transfer-template-department";

export const transferTemplateDepartmentAction = defineAction({
  name: "templates.transferDepartment",
  input: transferTemplateDepartmentSchema,
  handler: async ({ input, actor }) => {
    const template = await transferTemplateDepartment(
      actor,
      input.templateId,
      input.departmentId,
    );
    revalidatePath("/templates");
    revalidatePath(`/templates/${template.id}`);
    return template;
  },
});
