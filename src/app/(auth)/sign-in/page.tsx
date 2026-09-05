import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Placeholder sign-in route. Authentication is implemented in a later phase
 * (see docs/architecture/authentication-boundary.md, OPEN DECISION OD-43).
 * This page only validates the (auth) route group and layout — there is no
 * fake login form.
 */
export default function SignInPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>
          Authentication is not implemented yet. It arrives in a later phase.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild className="w-full">
          <Link href="/">Continue to the app</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
