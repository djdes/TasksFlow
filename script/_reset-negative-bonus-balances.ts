import "dotenv/config";
import { db } from "../server/db";
import { users } from "@shared/schema";
import { lt } from "drizzle-orm";

/**
 * Hot-fix: обнулить отрицательные bonus_balance у workers.
 *
 * Background: до commit'а ef3e8ec в DELETE/uncomplete handler был bug —
 * sibling-claimed tasks (claimed_by_other) при удалении реверсили price
 * с workerId который никогда не получал начисления. Wesetup outbox-cron
 * (Phase 1 race-siblings cleanup) делал client.deleteTask на каждый
 * sibling → каждый delete уводил чужой balance в минус.
 *
 * После fix новые delete'ы balance не трогают. Но существующие
 * накопленные -180/-50/etc. в БД остаются — этот скрипт их обнуляет.
 *
 * SAFE: только negative → 0. Положительные balances не трогаются.
 * Идемпотентно — повторный запуск ничего не делает.
 *
 * Запуск:
 *   npx tsx script/_reset-negative-bonus-balances.ts
 */
async function main() {
  // Найти всех у кого balance < 0.
  const affected = await db
    .select({ id: users.id, phone: users.phone, name: users.name, balance: users.bonusBalance })
    .from(users)
    .where(lt(users.bonusBalance, 0));

  if (affected.length === 0) {
    console.log("[reset] no users with negative balance — nothing to do");
    process.exit(0);
  }

  console.log(`[reset] found ${affected.length} users with negative balance:`);
  for (const u of affected) {
    console.log(
      `  - id=${u.id} phone=${u.phone} name=${u.name ?? "—"} balance=${u.balance}`,
    );
  }

  // Обнулить.
  const result = await db
    .update(users)
    .set({ bonusBalance: 0 })
    .where(lt(users.bonusBalance, 0));

  const header = Array.isArray(result) ? result[0] : result;
  const affectedCount =
    header && typeof header === "object" && "affectedRows" in header
      ? (header as { affectedRows: number }).affectedRows
      : affected.length;

  console.log(`[reset] reset ${affectedCount} balances to 0`);
  process.exit(0);
}

main().catch((err) => {
  console.error("[reset] failed", err);
  process.exit(1);
});
