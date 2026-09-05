/**
 * Local development seed. NOT run against production — there is no
 * "production seed" concept in Studio; production Departments/Users are
 * created through the application once the user-management feature exists.
 *
 * Creates:
 *   - one development Department (name from `SEED_DEPARTMENT_NAME`, default
 *     "Development")
 *   - one ADMIN user in it, ONLY if `SEED_ADMIN_EMAIL` + `SEED_ADMIN_PASSWORD`
 *     are set (never a hard-coded credential — docs/architecture/database.md)
 *
 * Run with `npm run db:seed` (also runs automatically after `prisma migrate
 * dev` unless `--skip-seed` is passed).
 */
import { PrismaClient } from "@prisma/client";

import { env } from "@/server/env";
import { hashPassword } from "@/server/auth/password";

const db = new PrismaClient();

async function main() {
  const departmentName = env.SEED_DEPARTMENT_NAME ?? "Development";

  const department = await db.department.upsert({
    where: { name: departmentName },
    update: {},
    create: { name: departmentName },
  });
  console.log(`✔ Department "${department.name}" (${department.id})`);

  if (!env.SEED_ADMIN_EMAIL || !env.SEED_ADMIN_PASSWORD) {
    console.log(
      "… SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD not set — skipping admin user. " +
        "See .env.example to seed one for local development.",
    );
    return;
  }

  const email = env.SEED_ADMIN_EMAIL.trim().toLowerCase();
  const passwordHash = await hashPassword(env.SEED_ADMIN_PASSWORD);

  const admin = await db.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      fullName: env.SEED_ADMIN_NAME ?? "Development Admin",
      passwordHash,
      role: "ADMIN",
      status: "ACTIVE",
      departmentId: department.id,
    },
  });
  console.log(
    `✔ ADMIN user "${admin.email}" (${admin.id}) — DEVELOPMENT ONLY, never a real credential.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
