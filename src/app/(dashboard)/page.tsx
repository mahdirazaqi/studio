import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { PageHeader, PageShell } from "@/components/layout/page-shell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { navItems } from "@/lib/navigation";

export const metadata: Metadata = { title: "Overview" };

const foundation = [
  "Next.js App Router + TypeScript (strict)",
  "Tailwind CSS v4 + shadcn/ui, Light / Dark / System themes",
  "Feature-based architecture with server/UI layer separation",
  "Server Action & REST Route Handler conventions",
  "Validation (Zod), typed error model, structured logging",
  "Validated environment configuration",
];

export default function OverviewPage() {
  const features = navItems.filter((item) => item.href !== "/");

  return (
    <PageShell>
      <PageHeader
        title="Studio"
        description="Control plane for the video-rendering pipeline. This is the Phase 1 application foundation."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Foundation in place</CardTitle>
            <CardDescription>
              Infrastructure ready for feature work.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {foundation.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-muted-foreground">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Planned areas</CardTitle>
            <CardDescription>
              Routes exist; features arrive in later phases.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {features.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="hover:bg-muted -mx-2 flex items-center gap-2 rounded-md px-2 py-2"
                  >
                    <item.icon className="text-muted-foreground size-4" />
                    <span>{item.label}</span>
                    <ArrowUpRight className="text-muted-foreground ml-auto size-4" />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
