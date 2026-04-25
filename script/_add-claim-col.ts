import "dotenv/config";
import { db } from "../server/db";

/**
 * Adds `tasks.claimed_by_worker_id` for race-for-bonus claim semantics.
 * Idempotent — safe to re-run.
 *
 * When a journal task with bonus is fan-out to multiple workers and one
 * of them completes it first, the other sibling tasks get this column
 * set to the completer's userId. The dashboard renders them under
 * «Сделано другими» so workers see why a task disappeared without
 * blaming themselves.
 */
async function main() {
  try {
    await db.execute(
      "ALTER TABLE tasks ADD COLUMN claimed_by_worker_id INT NULL"
    );
    console.log("[migrate] added column tasks.claimed_by_worker_id");
  } catch (err: any) {
    if (err?.code === "ER_DUP_FIELDNAME") {
      console.log(
        "[migrate] tasks.claimed_by_worker_id already exists, skipping"
      );
    } else {
      throw err;
    }
  }

  // Index ускоряет поиск sibling-задач при /complete (одна выборка
  // «taskies того же journalLink, не помеченные claimed»).
  try {
    await db.execute(
      "CREATE INDEX idx_tasks_claimed_by_worker ON tasks(claimed_by_worker_id)"
    );
    console.log("[migrate] created idx_tasks_claimed_by_worker");
  } catch (err: any) {
    if (err?.code === "ER_DUP_KEYNAME") {
      console.log(
        "[migrate] idx_tasks_claimed_by_worker already exists, skipping"
      );
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
