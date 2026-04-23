import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const DEMO_ORG_ID = "demo-screenshots";
const MANAGER_EMAIL = "demo-screenshots@wesetup.local";
const NEW_PASSWORD = "demo12345";

async function main() {
  const hash = await bcrypt.hash(NEW_PASSWORD, 10);

  const manager = await db.user.update({
    where: { email: MANAGER_EMAIL },
    data: { passwordHash: hash, isActive: true },
    select: { id: true, email: true, name: true },
  });
  console.log(`Updated manager: ${manager.name}  <${manager.email}>`);

  // Same password on all staff members in the demo org so QA can hop
  // between accounts without juggling credentials.
  const staff = await db.user.updateMany({
    where: {
      organizationId: DEMO_ORG_ID,
      email: { not: MANAGER_EMAIL },
      archivedAt: null,
    },
    data: { passwordHash: hash },
  });
  console.log(`Updated staff passwords: ${staff.count}`);

  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
