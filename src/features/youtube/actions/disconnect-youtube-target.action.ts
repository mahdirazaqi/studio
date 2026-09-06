"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { youtubeTargetIdParamSchema } from "@/features/youtube/schemas/connect-youtube-target.schema";
import { disconnectYoutubeTarget } from "@/features/youtube/use-cases/disconnect-youtube-target";

export const disconnectYoutubeTargetAction = defineAction({
  name: "youtube.disconnect",
  input: youtubeTargetIdParamSchema,
  handler: async ({ input, actor }) => {
    await disconnectYoutubeTarget(actor, input.targetId);
    revalidatePath("/youtube");
    return { ok: true as const };
  },
});
