"use server";

import { revalidatePath } from "next/cache";

import { defineAction } from "@/server/actions";
import { connectYoutubeTargetSchema } from "@/features/youtube/schemas/connect-youtube-target.schema";
import { connectYoutubeTarget } from "@/features/youtube/use-cases/connect-youtube-target";

export const connectYoutubeTargetAction = defineAction({
  name: "youtube.connect",
  input: connectYoutubeTargetSchema,
  handler: async ({ input, actor }) => {
    const target = await connectYoutubeTarget(actor, input);
    revalidatePath("/youtube");
    return target;
  },
});
