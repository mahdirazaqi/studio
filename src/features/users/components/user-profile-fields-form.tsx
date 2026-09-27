"use client";

import { useId, useState } from "react";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SafeUser } from "@/features/users/domain/user";

/**
 * Structurally identical to `@/server/actions`'s `ActionResult<SafeUser>` —
 * duplicated here (not imported) because that module is `server-only` and
 * this is a Client Component; the server/client boundary rule
 * (`docs/architecture/server-client-boundary.md`) forbids the import even
 * for a type-only reference. TypeScript's structural typing means
 * `updateOwnProfileAction`/`updateUserProfileAction` (whose real return type
 * *is* `ActionResult<SafeUser>`) still satisfy this prop without a cast.
 */
type ProfileUpdateResult =
  | { ok: true; data: SafeUser }
  | {
      ok: false;
      error: { message: string; fieldErrors?: Record<string, string[]> };
    };

/**
 * The one `fullName`/`phone` editing form — used by both the self-service
 * `/profile` page (`ProfileForm`) and the MANAGER/ADMIN "edit user" page
 * (`/users/[userId]/edit`), which only differ in *which* Server Action they
 * call and what read-only context surrounds the form (Phase 20/ADR-0051,
 * docs/domain/users.md). One field set, one validation/error-rendering
 * path — never two competing profile forms (CLAUDE.md §31).
 */
export function UserProfileFieldsForm({
  initialFullName,
  initialPhone,
  onSubmit,
  onSuccess,
}: {
  initialFullName: string;
  /** `null`/empty both render as an empty input — clearing the field back to
   * empty is what sends `phone: ""`, which the schema/use case treat as
   * "clear it" (`phone: null`). */
  initialPhone: string | null;
  onSubmit: (input: {
    fullName: string;
    phone: string;
  }) => Promise<ProfileUpdateResult>;
  onSuccess: (user: SafeUser) => void;
}) {
  const formId = useId();
  const [isPending, setIsPending] = useState(false);
  const [fullName, setFullName] = useState(initialFullName);
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isPending) return; // Never a duplicate in-flight submission.
    setFormError(null);
    setFieldErrors({});
    setIsPending(true);

    const result = await onSubmit({ fullName, phone });

    if (!result.ok) {
      setFieldErrors(result.error.fieldErrors ?? {});
      if (!result.error.fieldErrors) setFormError(result.error.message);
      setIsPending(false);
      return;
    }

    setIsPending(false);
    onSuccess(result.data);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {formError ? (
        <p
          role="alert"
          className="border-destructive/30 bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
          {formError}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${formId}-fullName`}>Name</Label>
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
          <Label htmlFor={`${formId}-phone`}>Phone number</Label>
          <Input
            id={`${formId}-phone`}
            type="tel"
            inputMode="tel"
            placeholder="+98 912 345 6789"
            value={phone}
            disabled={isPending}
            aria-invalid={fieldErrors.phone ? true : undefined}
            onChange={(e) => setPhone(e.target.value)}
          />
          {fieldErrors.phone?.map((m) => (
            <p key={m} className="text-destructive text-sm">
              {m}
            </p>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending}>
          <Save /> {isPending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
