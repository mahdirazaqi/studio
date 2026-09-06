import { authorize, type Actor } from "@/server/authz";
import type { SafeUser } from "@/features/users/domain/user";
import {
  listUsers as listUsersRepo,
  type ListUsersFilters,
} from "@/features/users/repository/user-repository";
import type { Paginated } from "@/types";

/**
 * List Users (docs/domain/authorization.md "View users" — MANAGER own
 * department, ADMIN all). `user:view` is the read-only capability; mutations
 * go through the stricter `user:manage`-gated use cases below.
 */
export async function listUsers(
  actor: Actor,
  filters: ListUsersFilters,
): Promise<Paginated<SafeUser>> {
  authorize(actor, "user:view");
  return listUsersRepo(actor, filters);
}
