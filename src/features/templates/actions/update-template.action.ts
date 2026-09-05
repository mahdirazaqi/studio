"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { updateTemplateSchema } from "@/features/templates/schemas/update-template.schema";
import { updateTemplate } from "@/features/templates/use-cases/update-template";

export const updateTemplateAction = defineAction({
  name: "templates.update",
  input: updateTemplateSchema,
  handler: async ({ input, actor }) => {
    const template = await updateTemplate(actor, input);
    revalidatePath("/templates");
    revalidatePath(`/templates/${template.id}`);
    return template;
  },
});
