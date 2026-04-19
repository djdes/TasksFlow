/**
 * Ad-hoc script: make climate_control / equipment_maintenance /
 * complaint_register mandatory on the currently-connected database.
 * Seed updates template records by code on every run, but the user's
 * prod DB was seeded before the flags changed, so we patch it directly
 * to avoid waiting for a full re-seed.
 *
 * Usage: `npx tsx scripts/update-mandatory-flags.ts`
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL,
});
const db = new PrismaClient({ adapter: new PrismaPg(pool) });

const CODES_TO_FLAG_MANDATORY = [
  "climate_control",
  "equipment_maintenance",
  "complaint_register",
];

async function main() {
  const result = await db.journalTemplate.updateMany({
    where: { code: { in: CODES_TO_FLAG_MANDATORY } },
    data: { isMandatorySanpin: true, isMandatoryHaccp: true },
  });
  console.log(`Updated ${result.count} templates to mandatory (San + HACCP).`);
  await db.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
