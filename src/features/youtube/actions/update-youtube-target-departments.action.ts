"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { updateYoutubeTargetDepartmentsSchema } from "@/features/youtube/schemas/connect-youtube-target.schema";
import { updateYoutubeTargetDepartments } from "@/features/youtube/use-cases/update-youtube-target-departments";

export const updateYoutubeTargetDepartmentsAction = defineAction({
  name: "youtube.updateDepartments",
  input: updateYoutubeTargetDepartmentsSchema,
  handler: async ({ input, actor }) => {
    const target = await updateYoutubeTargetDepartments(
      actor,
      input.targetId,
      input.departmentIds,
    );
    revalidatePath("/youtube");
    revalidatePath("/templates");
    return target;
  },
});
