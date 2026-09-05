import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const metadata: Metadata = { title: "Departments" };

export default function DepartmentsPage() {
  return (
    <PlaceholderPage
      title="Departments"
      description="The tenancy boundary. System administration area (ADMIN only)."
      phase="the Users & Departments phase"
    />
  );
}
