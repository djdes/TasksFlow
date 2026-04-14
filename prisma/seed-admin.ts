/**
 * Standalone admin seed.
 *
 * Creates (or updates) a test organization and an owner-role user with known
 * credentials so a developer can log in immediately after deploy/dev start.
 *
 * Idempotent — safe to re-run. On re-run it resets the password to the current
 * ADMIN_PASSWORD value, so you can also use it to "forgot password" reset for
 * this fixed account.
 *
 * Usage:
 *   npx tsx prisma/seed-admin.ts
 *
 * Override defaults via env:
 *   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=secret123 \
 *     ADMIN_ORG_NAME="ACME Foods" npx tsx prisma/seed-admin.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";

const DEFAULT_EMAIL = "admin@haccp.local";
const DEFAULT_PASSWORD = "admin1234";
const DEFAULT_ORG_NAME = "Тестовая организация (админ)";
const DEFAULT_ORG_TYPE = "meat"; // must match registerSchema enum
const DEFAULT_NAME = "Администратор";

const DEMO_TEAM = [
  { email: "admin@haccp.local", name: "\u0410\u0434\u043c\u0438\u043d\u0438\u0441\u0442\u0440\u0430\u0442\u043e\u0440", role: "owner" },
  { email: "chef@haccp.local", name: "\u041f\u0435\u0442\u0440\u043e\u0432 \u041f.\u041f.", role: "technologist" },
  { email: "souschef@haccp.local", name: "\u0421\u0438\u0434\u043e\u0440\u043e\u0432 \u0421.\u0421.", role: "operator" },
  { email: "hotcook@haccp.local", name: "\u0410\u043d\u0442\u043e\u043d\u043e\u0432\u0430 \u0410.\u0410.", role: "operator" },
  { email: "coldcook@haccp.local", name: "\u0411\u043e\u0440\u0438\u0441\u043e\u0432 \u0411.\u0411.", role: "operator" },
  { email: "pastry@haccp.local", name: "\u041a\u0443\u0437\u043d\u0435\u0446\u043e\u0432\u0430 \u041a.\u041a.", role: "operator" },
  { email: "waiter@haccp.local", name: "\u0421\u043c\u0438\u0440\u043d\u043e\u0432\u0430 \u041c.\u041c.", role: "operator" },
] as const;

const DEFAULT_LOGIN_NAME = "Крылов Денис Сергеевич";

const DEMO_TEAM_V2 = [
  {
    email: "admin@haccp.local",
    name: "Крылов Денис Сергеевич",
    role: "owner",
    positionTitle: "Управляющий",
  },
  {
    email: "quality@haccp.local",
    name: "Белова Елена Андреевна",
    role: "technologist",
    positionTitle: "Технолог по качеству",
  },
  {
    email: "souschef@haccp.local",
    name: "Никитин Павел Игоревич",
    role: "operator",
    positionTitle: "Су-шеф",
  },
  {
    email: "hotcook@haccp.local",
    name: "Волкова Анна Дмитриевна",
    role: "operator",
    positionTitle: "Повар горячего цеха",
  },
  {
    email: "coldcook@haccp.local",
    name: "Орлов Илья Максимович",
    role: "operator",
    positionTitle: "Повар холодного цеха",
  },
  {
    email: "pastry@haccp.local",
    name: "Мельникова Софья Романовна",
    role: "operator",
    positionTitle: "Кондитер",
  },
  {
    email: "storekeeper@haccp.local",
    name: "Кузьмин Артем Сергеевич",
    role: "operator",
    positionTitle: "Кладовщик",
  },
  {
    email: "sanitation@haccp.local",
    name: "Егорова Марина Викторовна",
    role: "operator",
    positionTitle: "Санитарный работник",
  },
] as const;

async function main() {
  const connectionString =
    process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL (or DATABASE_URL_DIRECT) is not set");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const email = (process.env.ADMIN_EMAIL || DEFAULT_EMAIL).trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD;
  const orgName = process.env.ADMIN_ORG_NAME || DEFAULT_ORG_NAME;
  const name = process.env.ADMIN_NAME || DEFAULT_LOGIN_NAME;

  if (password.length < 6) {
    console.error("ADMIN_PASSWORD must be at least 6 characters");
    process.exit(1);
  }
  if (password.length > 72) {
    console.error("ADMIN_PASSWORD must not exceed 72 characters (bcrypt limit)");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  // Trial period: far in the future so the admin org never expires during
  // day-to-day testing.
  const subscriptionEnd = new Date(
    Date.now() + 10 * 365 * 24 * 60 * 60 * 1000
  );

  try {
    const existing = await prisma.user.findUnique({
      where: { email },
      include: { organization: { select: { id: true, name: true } } },
    });

    let orgId: string;
    if (existing) {
      // User exists — update in place, keep same org.
      orgId = existing.organizationId;
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          name,
          passwordHash,
          role: "owner",
          positionTitle: "Управляющий",
          isActive: true,
        },
      });
      await prisma.organization.update({
        where: { id: orgId },
        data: {
          name: orgName,
          subscriptionPlan: "pro",
          subscriptionEnd,
        },
      });
      console.log(`  Updated existing admin user: ${email}`);
      console.log(`  Updated organization:       ${orgName} (${orgId})`);
    } else {
      // Fresh install — create org + user in a transaction.
      const result = await prisma.$transaction(async (tx) => {
        const org = await tx.organization.create({
          data: {
            name: orgName,
            type: DEFAULT_ORG_TYPE,
            subscriptionPlan: "pro",
            subscriptionEnd,
          },
        });
        const user = await tx.user.create({
          data: {
            email,
            name,
            passwordHash,
            role: "owner",
            positionTitle: "Управляющий",
            organizationId: org.id,
            isActive: true,
          },
        });
        return { org, user };
      });
      orgId = result.org.id;
      console.log(`  Created organization: ${result.org.name} (${orgId})`);
      console.log(`  Created admin user:   ${result.user.email}`);
    }

    for (const member of DEMO_TEAM_V2) {
      const memberEmail = member.email.trim().toLowerCase();
      const memberPasswordHash =
        memberEmail === email ? passwordHash : await bcrypt.hash(DEFAULT_PASSWORD, 12);

      const existingDemoUser = await prisma.user.findUnique({
        where: { email: memberEmail },
        select: { id: true },
      });

      if (existingDemoUser) {
        await prisma.user.update({
          where: { id: existingDemoUser.id },
          data: {
            name: member.name,
            role: member.role,
            positionTitle: member.positionTitle,
            passwordHash: memberPasswordHash,
            organizationId: orgId,
            isActive: true,
          },
        });
        console.log(`  Updated demo user:    ${memberEmail}`);
      } else {
        await prisma.user.create({
          data: {
            email: memberEmail,
            name: member.name,
            role: member.role,
            positionTitle: member.positionTitle,
            passwordHash: memberPasswordHash,
            organizationId: orgId,
            isActive: true,
          },
        });
        console.log(`  Created demo user:    ${memberEmail}`);
      }
    }

    console.log("");
    console.log("Admin credentials:");
    console.log(`  Email:    ${email}`);
    console.log(`  Password: ${password}`);
    console.log(`  Role:     owner`);
    console.log(`  Org ID:   ${orgId}`);
    console.log("");
    console.log("Login at /login.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
