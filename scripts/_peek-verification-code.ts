import { db } from "@/lib/db";

async function main() {
  const email = process.argv[2] || "qa-manager@wesetup.test";
  const row = await db.emailVerification.findUnique({
    where: { email },
  });
  if (!row) {
    console.log("нет записи верификации для", email);
    return;
  }
  console.log("hash:", row.codeHash);
  console.log("expiresAt:", row.expiresAt);
  console.log("attempts:", row.attempts);
  // Brute-force the 6-digit code against the bcrypt hash.
  const bcrypt = await import("bcryptjs");
  for (let i = 0; i < 1_000_000; i++) {
    const candidate = i.toString().padStart(6, "0");
    if (await bcrypt.compare(candidate, row.codeHash)) {
      console.log("CODE:", candidate);
      break;
    }
  }
  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
