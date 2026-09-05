"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { signOutAction } from "@/features/auth/actions/sign-out.action";

export function SignOutMenuItem() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    startTransition(async () => {
      const result = await signOutAction();
      // Sign-out always ends the local session state regardless of `ok`
      // (see the action: it is a no-op on an already-invalid session, never
      // an error) — always redirect to sign-in.
      router.push(result.ok ? result.data.redirectTo : "/sign-in");
      router.refresh();
    });
  }

  return (
    <DropdownMenuItem
      variant="destructive"
      disabled={isPending}
      onSelect={(event) => {
        event.preventDefault();
        handleSignOut();
      }}
    >
      <LogOut />
      {isPending ? "Signing out…" : "Sign out"}
    </DropdownMenuItem>
  );
}
