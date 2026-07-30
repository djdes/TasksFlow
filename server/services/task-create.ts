/**
 * Создание задачи — единая точка для HTTP-роута и Telegram-бота.
 *
 * Извлечено из inline-хендлера POST /api/tasks без изменения поведения:
 * порядок проверок и тексты сообщений сохранены дословно, потому что на них
 * завязаны существующие тесты роутов (create-update-task.test.ts, task-scope).
 */

import type { InsertTask, Task } from "@shared/schema";
import { storage } from "../storage";
import {
  canAssignToWorker,
  resolveActorCompanyId,
  TaskServiceError,
  type TaskActor,
} from "./task-actor";

export type CreateTaskParams = {
  /** Уже провалидированный insertTaskSchema payload. */
  input: InsertTask;
  actor: TaskActor;
  /**
   * companyId вызывающей стороны. Если не передан — резолвим из актора.
   * Роут передаёт свой, чтобы не ходить в БД дважды.
   */
  companyId?: number | null;
};

export async function createTaskForActor({
  input,
  actor,
  companyId: providedCompanyId,
}: CreateTaskParams): Promise<Task> {
  const companyId =
    providedCompanyId !== undefined
      ? providedCompanyId
      : await resolveActorCompanyId(actor);
  if (!companyId) {
    throw new TaskServiceError(400, "Company не определена");
  }

  // Multi-tenant scope: workerId должен принадлежать той же компании.
  // Иначе админ компании A мог бы создать задачу со ссылкой на
  // worker'а компании B — задача попадёт в task-list компании A
  // с broken workerId, либо в список «моих задач» worker'а B
  // (зависит от фильтра).
  if (input.workerId != null) {
    const worker = await storage.getUserById(input.workerId);
    if (!worker || worker.companyId !== companyId) {
      throw new TaskServiceError(404, "Сотрудник не найден");
    }
  }

  // Scope-check: руководитель может назначать задачи только своим
  // подчинённым. Админ и API key пропускаются.
  if (actor.kind !== "apiKey") {
    const me = await storage.getUserById(actor.userId);
    if (me && !me.isAdmin) {
      if (!canAssignToWorker(me, input.workerId ?? null)) {
        throw new TaskServiceError(
          403,
          "Можно назначать задачи только своим подчинённым",
        );
      }
    }
  }

  const task = await storage.createTask({
    ...input,
    companyId,
  });

  // Audit log (П-17 спека Wesetup): создание задачи.
  const { recordAudit } = await import("../audit-log");
  void recordAudit({
    companyId: task.companyId,
    actorWorkerId: actor.kind === "apiKey" ? null : actor.userId,
    taskId: task.id,
    action: "task.created",
    payload: {
      title: task.title,
      workerId: task.workerId,
      requiresPhoto: task.requiresPhoto,
      isRecurring: task.isRecurring,
      price: task.price,
    },
  });

  return task;
}
