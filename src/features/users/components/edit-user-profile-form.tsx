"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { updateUserProfileAction } from "@/features/users/actions/update-user-profile.action";
import { UserProfileFieldsForm } from "@/features/users/components/user-profile-fields-form";

/**
 * `/users/[userId]/edit`'s `fullName`/`phone` editor for MANAGER/ADMIN
 * editing **another** user — `updateUserProfileAction` re-authorizes
 * everything server-side (`assertCanEditProfile`); this component only
 * renders the shared field form and reports success. Role/active-status
 * changes are a separate, already-existing control (`UserActions`) rendered
 * alongside this on the same page, never folded into this form (each stays
 * its own authorized, audited-by-nature operation — docs/domain/users.md).
 */
export function EditUserProfileForm({
  userId,
  fullName,
  phone,
}: {
  userId: string;
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
          onSubmit={(input) => updateUserProfileAction({ userId, ...input })}
          onSuccess={(user) => {
            toast.success(`"${user.fullName}" updated.`);
            router.refresh();
          }}
        />
      </CardContent>
    </Card>
  );
}
