import type { Metadata } from "next";

import { PlaceholderPage } from "@/components/layout/placeholder-page";

export const metadata: Metadata = { title: "Users" };

export default function UsersPage() {
  return (
    <PlaceholderPage
      title="Users"
      description="Department members, roles, and the active / disabled lifecycle."
      phase="the Users & Departments phase"
    />
  );
}
