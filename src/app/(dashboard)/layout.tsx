import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/layout/app-header";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getCurrentUser } from "@/server/auth/current-user";

/**
 * Authenticated application shell.
 *
 * Every route under this group renders inside the sidebar + header shell.
 * `getCurrentUser()` resolves the session cookie; a missing/expired/invalid
 * session, or a session belonging to a no-longer-`ACTIVE` user, all resolve to
 * `null` here and redirect to `/sign-in` (docs/architecture/
 * authentication-boundary.md). Reading `cookies()` also opts this route group
 * out of static rendering, so nothing here is ever served from a shared cache
 * (docs/architecture/authentication.md "Caching").
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        currentUser={{
          displayName: user.displayName,
          email: user.email,
          role: user.role,
          departmentName: user.departmentName,
        }}
      />
      <SidebarInset className="flex min-h-svh flex-col">
        <AppHeader />
        <main className="flex flex-1 flex-col">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
