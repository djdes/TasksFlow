import "dotenv/config";
import { db as prisma } from "@/lib/db";

const TARGET_USER_ID = "cmnyodrhl0005ootsujeud3cc"; // Громов Илья Павлович
const PHONE = "+79991234567";

async function main() {
  const updated = await prisma.user.update({
    where: { id: TARGET_USER_ID },
    data: { phone: PHONE },
    select: { id: true, name: true, phone: true },
  });
  console.log("[demo-link] set phone:", updated);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
