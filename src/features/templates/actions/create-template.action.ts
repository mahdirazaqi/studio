"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { templateInputSchema } from "@/features/templates/schemas/template-input.schema";
import { createTemplate } from "@/features/templates/use-cases/create-template";

export const createTemplateAction = defineAction({
  name: "templates.create",
  input: templateInputSchema,
  handler: async ({ input, actor }) => {
    const template = await createTemplate(actor, input);
    revalidatePath("/templates");
    return template;
  },
});
