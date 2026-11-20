/**
 * Удаление задачи — общая часть для DELETE /api/tasks/:id и «убрать задачи,
 * которых больше нет в новой должностной инструкции».
 *
 * Вынесено из роута без изменения поведения: возврат премии выполненной
 * задачи, удаление, аудит и уборка файлов. Права и компанию проверяет
 * вызывающая сторона.
 */

import type { Task } from "@shared/schema";
import { storage } from "../storage";
import { resolveUploadAbs } from "../uploads-paths";

/** Премию вернуть не удалось — задачу не удаляем, иначе баланс разойдётся. */
export class BalanceReversalError extends Error {
  constructor() {
    super("Не удалось обновить баланс при удалении задачи");
    this.name = "BalanceReversalError";
  }
}

export async function removeTask(existing: Task, actorUserId: number | null): Promise<void> {
  // FINANCIAL SAFETY: при удалении completed task с positive price
  // вычитаем из баланса исполнителя — иначе balance остаётся с
  // «phantom»-зарплатой, без следа в task-журнале. Раньше: admin
  // удалял старую completed задачу для очистки списка → у worker'а
  // остался остаток оплаты без подтверждения; невозможно сверить.
  //
  // Race-fix: используем атомарный transitionTaskToUncompleted.
  // Без него два concurrent DELETE могли оба прочитать
  // isCompleted=true, оба вычесть price (двойной дебет) и потом
  // оба удалить таск (одно affectedRows=0, но без error). Теперь
  // только один из них переведёт isCompleted в false и сделает
  // дебет; остальные получат transitioned=false и пропустят.
  //
  // 2026-05-09: ВАЖНО — claimedByWorkerId NOT NULL означает что
  // этот task — sibling, баланс получил claimedByWorkerId (winner),
  // НЕ workerId (originally assigned). Reversal с workerId уведёт
  // его balance в минус (он не получал начисления). Скипаем reversal
  // для claimed-by-other tasks. Жалоба владельца «премия -180₽»
  // = 3 sibling-cleanups × 60₽ списано из чужих balance'ов.
  if (
    existing.price &&
    existing.price > 0 &&
    existing.workerId &&
    existing.claimedByWorkerId === null
  ) {
    try {
      const reversed = await storage.transitionTaskToUncompleted(existing.id);
      if (reversed) {
        await storage.updateUserBalance(existing.workerId, -existing.price);
      }
    } catch (balanceErr) {
      console.error("[task-delete] balance reversal failed", balanceErr);
      throw new BalanceReversalError();
    }
  }

  await storage.deleteTask(existing.id);

  // Audit log (П-17 спека Wesetup): фиксируем deletion.
  const { recordAudit } = await import("../audit-log");
  void recordAudit({
    companyId: existing.companyId,
    actorWorkerId: actorUserId,
    taskId: existing.id,
    action: "task.deleted",
    payload: {
      title: existing.title,
      wasCompleted: existing.isCompleted,
      workerId: existing.workerId,
    },
  });

  // Удаляем все привязанные к задаче файлы с диска. Раньше:
  // удалённая задача оставляла photoUrls + examplePhotoUrl как
  // orphan-файлы в /uploads/, ничем не убираемые — disk usage
  // рос неконтролируемо. Best-effort, не валим ответ при ошибке.
  try {
    const { unlink } = await import("fs/promises");
    const candidates: string[] = [];
    const photos = (existing as { photoUrls?: string[] }).photoUrls;
    if (Array.isArray(photos)) candidates.push(...photos);
    if (existing.photoUrl) candidates.push(existing.photoUrl);
    if (existing.examplePhotoUrl) candidates.push(existing.examplePhotoUrl);
    for (const rel of candidates) {
      const abs = resolveUploadAbs(rel);
      if (!abs) continue;
      await unlink(abs).catch(() => null);
    }
  } catch (cleanupErr) {
    console.warn("[task-delete] orphan files cleanup failed", cleanupErr);
  }
}
