import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const metadata: Metadata = { title: "Templates" };

export default function TemplatesPage() {
  return (
    <PlaceholderPage
      title="Templates"
      description="Reusable render recipes and their asset slots."
      phase="the Templates phase"
    />
  );
}
