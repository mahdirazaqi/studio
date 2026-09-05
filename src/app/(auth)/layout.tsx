import { Clapperboard } from "lucide-react";

import { siteConfig } from "@/lib/site-config";

/**
 * Layout for unauthenticated routes (sign-in). Centered, minimal, no app shell.
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-muted/30 flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <div className="flex items-center gap-2 font-semibold">
        <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg">
          <Clapperboard className="size-4" />
        </div>
        {siteConfig.name}
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
