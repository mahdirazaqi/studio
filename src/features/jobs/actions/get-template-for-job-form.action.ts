"use server";

import { z } from "zod";

import { defineAction } from "@/server/actions";
import { commonSchemas } from "@/server/validation";
import { getTemplateForJobForm } from "@/features/jobs/use-cases/get-template-for-job-form";

export const getTemplateForJobFormAction = defineAction({
  name: "jobs.getTemplateForJobForm",
  input: z.object({ templateId: commonSchemas.id }),
  handler: async ({ input, actor }) =>
    getTemplateForJobForm(actor, input.templateId),
});
