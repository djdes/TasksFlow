import "dotenv/config";
import { db } from "../server/db";

async function main() {
  // Idempotent — MySQL ignores duplicate-column errors when wrapped.
  try {
    await db.execute("ALTER TABLE tasks ADD COLUMN journal_link TEXT NULL");
    console.log("[migrate] added column tasks.journal_link");
  } catch (err: any) {
    if (err?.code === "ER_DUP_FIELDNAME") {
      console.log("[migrate] tasks.journal_link already exists, skipping");
    } else {
      throw err;
    }
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});
