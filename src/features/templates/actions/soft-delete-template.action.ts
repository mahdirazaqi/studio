"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { templateIdParamSchema } from "@/features/templates/schemas/template-input.schema";
import { softDeleteTemplate } from "@/features/templates/use-cases/soft-delete-template";

export const softDeleteTemplateAction = defineAction({
  name: "templates.softDelete",
  input: templateIdParamSchema,
  handler: async ({ input, actor }) => {
    await softDeleteTemplate(actor, input.templateId);
    revalidatePath("/templates");
    return { templateId: input.templateId };
  },
});
