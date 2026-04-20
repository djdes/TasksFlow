/**
 * One-shot helper to bootstrap a TasksFlow API key for the WeSetup
 * integration. Reuses an existing admin if there is one, generates a
 * fresh `tfk_*` key, and prints the plaintext to stdout exactly once.
 *
 * Run from /c/www/TasksFlow:
 *   npx tsx script/_wesetup-bootstrap.ts
 */
import "dotenv/config";
import crypto from "node:crypto";
import { db } from "../server/db";
import { apiKeys, companies, users } from "../shared/schema";
import { and, eq, isNull } from "drizzle-orm";

const ADMIN_PHONE = "+79991234567";
const COMPANY_NAME = "WeSetup test company";

function generateApiKey(): string {
  return `tfk_${crypto.randomBytes(32).toString("base64url")}`;
}
function hashApiKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

async function main() {
  const now = Math.floor(Date.now() / 1000);

  // 1. Find or create a company.
  let [company] = await db
    .select()
    .from(companies)
    .where(eq(companies.name, COMPANY_NAME));
  if (!company) {
    const [res] = await db.insert(companies).values({
      name: COMPANY_NAME,
      createdAt: now,
    });
    const insertId = (res as any).insertId as number;
    [company] = await db
      .select()
      .from(companies)
      .where(eq(companies.id, insertId));
    console.log(`[bootstrap] created company id=${company.id}`);
  } else {
    console.log(`[bootstrap] reusing company id=${company.id}`);
  }

  // 2. Find or create an admin user pinned to that company.
  let [admin] = await db
    .select()
    .from(users)
    .where(eq(users.phone, ADMIN_PHONE));
  if (!admin) {
    const [res] = await db.insert(users).values({
      phone: ADMIN_PHONE,
      name: "WeSetup Bot",
      isAdmin: true,
      createdAt: now,
      companyId: company.id,
    });
    const insertId = (res as any).insertId as number;
    [admin] = await db.select().from(users).where(eq(users.id, insertId));
    console.log(`[bootstrap] created admin id=${admin.id}`);
  } else {
    if (!admin.isAdmin || admin.companyId !== company.id) {
      await db
        .update(users)
        .set({ isAdmin: true, companyId: company.id })
        .where(eq(users.id, admin.id));
      console.log(`[bootstrap] promoted admin id=${admin.id} to company ${company.id}`);
    } else {
      console.log(`[bootstrap] reusing admin id=${admin.id}`);
    }
  }

  // 3. Mint a fresh API key tied to that company. We don't reuse old keys
  //    even if they exist — printing back an old plaintext is impossible
  //    (we only stored the hash), and rotating is harmless.
  const plaintext = generateApiKey();
  const keyHash = hashApiKey(plaintext);
  const keyPrefix = plaintext.slice(0, 12);

  const [keyRes] = await db.insert(apiKeys).values({
    name: "WeSetup integration",
    keyHash,
    keyPrefix,
    companyId: company.id,
    createdByUserId: admin.id,
    createdAt: now,
  });
  const keyId = (keyRes as any).insertId as number;
  console.log(`[bootstrap] minted key id=${keyId} prefix=${keyPrefix}`);
  console.log("");
  console.log("API_KEY=" + plaintext);
  console.log("COMPANY_ID=" + company.id);
  console.log("ADMIN_ID=" + admin.id);
  console.log("ADMIN_PHONE=" + ADMIN_PHONE);
  process.exit(0);
}

main().catch((err) => {
  console.error("[bootstrap] failed", err);
  process.exit(1);
});
