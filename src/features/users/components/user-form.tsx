"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createUserAction } from "@/features/users/actions/create-user.action";
import { ROLES, type Role } from "@/lib/roles";

export interface DepartmentChoice {
  id: string;
  name: string;
}

/**
 * Create form for a new User (docs/domain/users.md "Creation"). There is no
 * edit form — email/name/password are set once at creation; role and
 * active/disabled status are changed through `UserActions` on the list page
 * instead (each its own authorized, audited-by-nature operation, not a
 * generic PATCH).
 */
export function UserForm({
  departmentChoices,
  /** MANAGER can only ever create a `USER` — this is a rendering choice
   * only; `assertCanCreateUserWithRole` re-checks independently. */
  canCreateManagers,
}: {
  /** ADMIN only — MANAGER always creates into their own department. */
  departmentChoices?: DepartmentChoice[];
  canCreateManagers: boolean;
}) {
  const router = useRouter();
  const formId = useId();
  const [isPending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("USER");
  const [departmentId, setDepartmentId] = useState(
    departmentChoices?.[0]?.id ?? "",
  );

  const availableRoles = canCreateManagers ? ROLES : (["USER"] as const);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await createUserAction({
        ...(departmentChoices ? { departmentId } : {}),
        email,
        fullName,
        password,
        role,
      });

      if (!result.ok) {
        setFieldErrors(result.error.fieldErrors ?? {});
        if (!result.error.fieldErrors) setFormError(result.error.message);
        return;
      }

      toast.success(`"${result.data.fullName}" created.`);
      router.push("/users");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {formError ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {formError}
        </p>
      ) : null}

      <Card>
        <CardContent className="space-y-4 py-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-fullName`}>Full name</Label>
              <Input
                id={`${formId}-fullName`}
                value={fullName}
                disabled={isPending}
                aria-invalid={fieldErrors.fullName ? true : undefined}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
              {fieldErrors.fullName?.map((m) => (
                <p key={m} className="text-destructive text-sm">
                  {m}
                </p>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-email`}>Email</Label>
              <Input
                id={`${formId}-email`}
                type="email"
                value={email}
                disabled={isPending}
                aria-invalid={fieldErrors.email ? true : undefined}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              {fieldErrors.email?.map((m) => (
                <p key={m} className="text-destructive text-sm">
                  {m}
                </p>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-password`}>Password</Label>
              <Input
                id={`${formId}-password`}
                type="password"
                value={password}
                disabled={isPending}
                aria-invalid={fieldErrors.password ? true : undefined}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
              />
              {fieldErrors.password?.map((m) => (
                <p key={m} className="text-destructive text-sm">
                  {m}
                </p>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${formId}-role`}>Role</Label>
              <select
                id={`${formId}-role`}
                value={role}
                disabled={isPending}
                className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
                onChange={(e) => setRole(e.target.value as Role)}
              >
                {availableRoles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {departmentChoices ? (
              <div className="space-y-1.5">
                <Label htmlFor={`${formId}-department`}>Department</Label>
                <select
                  id={`${formId}-department`}
                  value={departmentId}
                  disabled={isPending}
                  className="border-input h-9 w-full rounded-md border bg-transparent px-3 text-sm shadow-xs"
                  onChange={(e) => setDepartmentId(e.target.value)}
                >
                  {departmentChoices.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => router.back()}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          <Save /> {isPending ? "Creating…" : "Create user"}
        </Button>
      </div>
    </form>
  );
}
