"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { updateOwnProfileAction } from "@/features/users/actions/update-user-profile.action";
import { UserProfileFieldsForm } from "@/features/users/components/user-profile-fields-form";

/**
 * The `/profile` self-service edit form — always the signed-in actor's own
 * record (`updateOwnProfileAction` never takes a `userId`). Only `fullName`/
 * `phone` are ever submitted; role/department/status are shown elsewhere on
 * the page as read-only, never as inputs here (docs/domain/authorization.md
 * "Edit own profile" — a plain `USER` may reach this form, so nothing on it
 * may touch a privileged field, structurally, not by convention).
 */
export function ProfileForm({
  fullName,
  phone,
}: {
  fullName: string;
  phone: string | null;
}) {
  const router = useRouter();

  return (
    <Card>
      <CardContent className="py-6">
        <UserProfileFieldsForm
          initialFullName={fullName}
          initialPhone={phone}
          onSubmit={updateOwnProfileAction}
          onSuccess={() => {
            toast.success("Profile updated successfully.");
            router.refresh();
          }}
        />
      </CardContent>
    </Card>
  );
}
