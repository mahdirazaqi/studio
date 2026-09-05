import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const metadata: Metadata = { title: "Files" };

export default function FilesPage() {
  return (
    <PlaceholderPage
      title="Files"
      description="The File Gallery: reusable media assets and job artifacts."
      phase="the Files phase"
    />
  );
}
