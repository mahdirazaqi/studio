"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { templateIdParamSchema } from "@/features/templates/schemas/template-input.schema";
import {
  disableTemplate,
  enableTemplate,
} from "@/features/templates/use-cases/set-template-status";

export const enableTemplateAction = defineAction({
  name: "templates.enable",
  input: templateIdParamSchema,
  handler: async ({ input, actor }) => {
    await enableTemplate(actor, input.templateId);
    revalidatePath("/templates");
    return { templateId: input.templateId };
  },
});

export const disableTemplateAction = defineAction({
  name: "templates.disable",
  input: templateIdParamSchema,
  handler: async ({ input, actor }) => {
    await disableTemplate(actor, input.templateId);
    revalidatePath("/templates");
    return { templateId: input.templateId };
  },
});
