import "dotenv/config";
import { db } from "../server/db";

/**
 * Phase 1 двухстадийной верификации задач (employee fills → manager
 * approves → done). Добавляет 5 колонок в tasks. Идемпотентно.
 *
 * Семантика verification_status:
 *   • NULL          — задача не требует проверки (legacy / personal /
 *                     задача без verifier'а). Старое поведение:
 *                     /complete сразу ставит isCompleted=true.
 *   • 'pending'     — задача требует проверки, ждёт выполнения
 *                     сотрудником. Сотрудник видит её в активных.
 *   • 'submitted'   — сотрудник нажал «Готово», ждёт verifier'а.
 *                     isCompleted=false, balance НЕ начислен.
 *                     В UI verifier'а появляется в табе «На проверке».
 *   • 'approved'    — verifier одобрил. isCompleted=true, completedAt=
 *                     когда одобрено, balance начислен, mirror в
 *                     WeSetup-журнал отправлен.
 *   • 'rejected'    — verifier отклонил с причиной. isCompleted=false,
 *                     задача снова active у сотрудника с пометкой
 *                     причины отказа.
 *
 * verifier_worker_id — кто должен проверить эту задачу. Заполняется
 * при создании задачи из bulk-assign-today (берётся из
 * journal-responsibles ответственного по журналу). NULL = задача без
 * проверки.
 *
 * verified_by_user_id, verified_at — кто реально проверил и когда.
 * Может отличаться от verifier_worker_id (admin'ы могут одобрить за
 * verifier'а).
 *
 * reject_reason — причина отказа для отображения сотруднику.
 *
 * Phase 2 (следующий тик): endpoints /api/tasks/:id/submit и /verify.
 * Phase 3: bulk-assign-today выставляет verifier_worker_id.
 * Phase 4: UI таб «На проверке» в Dashboard.
 * Phase 5: WeSetup-mirror только на approved.
 */
async function addColumn(name: string, ddl: string) {
  try {
    await db.execute(ddl);
    console.log(`[migrate] added column tasks.${name}`);
  } catch (err: any) {
    if (err?.code === "ER_DUP_FIELDNAME") {
      console.log(`[migrate] tasks.${name} already exists, skipping`);
    } else {
      throw err;
    }
  }
}

async function addIndex(name: string, ddl: string) {
  try {
    await db.execute(ddl);
    console.log(`[migrate] created ${name}`);
  } catch (err: any) {
    if (err?.code === "ER_DUP_KEYNAME") {
      console.log(`[migrate] ${name} already exists, skipping`);
    } else {
      throw err;
    }
  }
}

async function main() {
  await addColumn(
    "verification_status",
    "ALTER TABLE tasks ADD COLUMN verification_status VARCHAR(20) NULL"
  );
  await addColumn(
    "verifier_worker_id",
    "ALTER TABLE tasks ADD COLUMN verifier_worker_id INT NULL"
  );
  await addColumn(
    "verified_by_user_id",
    "ALTER TABLE tasks ADD COLUMN verified_by_user_id INT NULL"
  );
  await addColumn(
    "verified_at",
    "ALTER TABLE tasks ADD COLUMN verified_at INT NULL"
  );
  await addColumn(
    "reject_reason",
    "ALTER TABLE tasks ADD COLUMN reject_reason TEXT NULL"
  );

  // Индексы для горячих путей:
  //   • verifier-list: «задачи на проверке у меня» — выборка по
  //     (verifier_worker_id, verification_status='submitted').
  //   • general status: для UI таба «На проверке» админу.
  await addIndex(
    "idx_tasks_verifier_status",
    "CREATE INDEX idx_tasks_verifier_status ON tasks(verifier_worker_id, verification_status)"
  );
  await addIndex(
    "idx_tasks_verification_status",
    "CREATE INDEX idx_tasks_verification_status ON tasks(verification_status)"
  );

  console.log("[migrate] verification columns + indexes ready");
  process.exit(0);
}

main().catch((err) => {
  console.error("[migrate] failed", err);
  process.exit(1);
});
