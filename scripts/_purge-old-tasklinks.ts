import { db } from "@/lib/db";

/**
 * Убираем старые TaskLinks интеграции «Тестовая организация (админ)» —
 * они создавались в тестах в начале апреля, ссылаются на tasksflow task
 * ids 14–25, и эти же id теперь переиспользованы новой демо-org из-за
 * общего auto_increment в локальном TF. Дубликаты вводят в
 * заблуждение /task-fill (findFirst возвращает случайную запись).
 *
 * Вариант «вычистить всё» сознательный: у старой интеграции все
 * сотрудники — тестовые из архивированной группы, их TasksFlow-задачи
 * давно просрочились. Новые интеграции демо и домашней куни не
 * тронуты.
 */

const OLD_INTEGRATION_ID = "cmo6zuolj00008c9mhhp1kv5s";

async function main() {
  const countBefore = await db.tasksFlowTaskLink.count({
    where: { integrationId: OLD_INTEGRATION_ID },
  });
  console.log(`Old-integration TaskLinks: ${countBefore}`);
  if (countBefore === 0) {
    console.log("Nothing to purge.");
    return;
  }
  const r = await db.tasksFlowTaskLink.deleteMany({
    where: { integrationId: OLD_INTEGRATION_ID },
  });
  console.log(`Deleted: ${r.count}`);

  // Sanity: how many duplicate tasksflowTaskId pairs remain?
  const all = await db.tasksFlowTaskLink.findMany({
    select: { tasksflowTaskId: true },
  });
  const map = new Map<number, number>();
  for (const l of all) map.set(l.tasksflowTaskId, (map.get(l.tasksflowTaskId) ?? 0) + 1);
  const dupes = Array.from(map.entries()).filter(([, n]) => n > 1).length;
  console.log(`Remaining duplicates: ${dupes}`);

  await db.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
