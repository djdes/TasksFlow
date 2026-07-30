/**
 * Закрытие задачи — единая точка для HTTP-роута и Telegram-бота.
 *
 * Извлечено из inline-хендлера POST /api/tasks/:id/complete. Порядок операций
 * сохранён дословно и он здесь критичен:
 *
 *   scope → права → идемпотентность → гейт фото → гейт чек-листа →
 *   ветка верификации → атомарный переход → премия → sibling-claim →
 *   письмо → аудит
 *
 * Любая перестановка ломает деньги: премия начисляется строго после
 * успешного атомарного перехода, а при отправке на проверку — не начисляется
 * вовсе (это делает /verify после approve).
 */

import type { Task } from "@shared/schema";
import { storage } from "../storage";
import { sendTaskCompletedEmail } from "../mail";
import { parseJournalLink } from "@shared/journal-link";
import {
  actorUserId,
  resolveActorCompanyId,
  TaskServiceError,
  type TaskActor,
} from "./task-actor";

export type CompleteOutcome =
  /** Задача закрыта, премия начислена. */
  | "completed"
  /** Ушла на проверку к verifier'у. Премии пока нет. */
  | "submitted"
  /** Ничего не делали: уже закрыта, уже на проверке или проиграли гонку. */
  | "already";

export type CompleteTaskResult = {
  outcome: CompleteOutcome;
  task: Task;
};

export type CompleteTaskParams = {
  taskId: number;
  actor: TaskActor;
  comment?: string | null;
};

export async function completeTaskForActor({
  taskId,
  actor,
  comment,
}: CompleteTaskParams): Promise<CompleteTaskResult> {
  const task = await storage.getTask(taskId);
  if (!task) {
    throw new TaskServiceError(404, "Задача не найдена");
  }

  // Multi-tenant scope-check: задача должна принадлежать компании
  // вызывающей стороны (API key чужой компании или session-юзер
  // другой компании не должны завершать задачу).
  const callerCompanyId = await resolveActorCompanyId(actor);
  if (callerCompanyId !== null && task.companyId !== callerCompanyId) {
    throw new TaskServiceError(404, "Задача не найдена");
  }

  // Проверка прав: API key имеет админские права, иначе исполнитель или session-админ.
  const meId = actorUserId(actor);
  let isAllowed = false;
  if (actor.kind === "apiKey") {
    isAllowed = true;
  } else if (meId === task.workerId) {
    isAllowed = true;
  } else if (meId !== null) {
    const currentUser = await storage.getUserById(meId);
    if (currentUser?.isAdmin) {
      isAllowed = true;
    }
  }

  if (!isAllowed) {
    throw new TaskServiceError(403, "Нет прав для изменения задачи");
  }

  // Идемпотентность: если задача уже выполнена — возвращаем текущее
  // состояние БЕЗ повторного начисления баланса.
  if (task.isCompleted) {
    return { outcome: "already", task };
  }
  // Phase 1 двухстадийной верификации: если задача уже в «submitted» —
  // повторный complete от того же воркера не должен ничего делать (она уже
  // ждёт verifier'а). API key (machine integrations) обходит, чтобы старая
  // интеграция не ломалась.
  if (actor.kind !== "apiKey" && task.verificationStatus === "submitted") {
    return { outcome: "already", task };
  }

  // Если требуется фото, проверяем что оно загружено
  const taskPhotoUrls = task.photoUrls || [];
  const hasPhotos = taskPhotoUrls.length > 0 || task.photoUrl;
  if (task.requiresPhoto && !hasPhotos) {
    throw new TaskServiceError(
      400,
      "Необходимо загрузить фото перед завершением",
    );
  }

  // Чек-лист: задачу нельзя завершить, пока не все пункты выполнены
  // (каждый пункт закрывается фото). Задачи без чек-листа не затрагиваются.
  const completeChecklist = task.checklist || [];
  if (completeChecklist.length > 0 && !completeChecklist.every((it) => it.done)) {
    const doneCount = completeChecklist.filter((it) => it.done).length;
    throw new TaskServiceError(
      400,
      `Отметьте все пункты чек-листа с фото (${doneCount}/${completeChecklist.length})`,
    );
  }

  // Phase 1 двухстадийной верификации:
  //   • Если у задачи есть verifier_worker_id и текущий вызов —
  //     не от API-key (machine integrations апрувят сами) и не от
  //     самого verifier'а (он своё approve делает через /verify),
  //     то задача переходит в submitted. Balance НЕ начисляется
  //     до approve. WeSetup-mirror тоже не отправляется (он
  //     уйдёт после approve).
  //   • Если verifier == текущий юзер — он завершает задачу как
  //     обычно (исполнитель и проверяющий совпадают для shared-
  //     задач, где руководитель сам в смене).
  //   • Если verifier_worker_id == NULL/undefined — старое
  //     поведение (legacy задачи без проверки). undefined может
  //     прилетать на legacy-БД где schema-self-check ещё не
  //     добавил колонки.
  const requiresVerification =
    actor.kind !== "apiKey" &&
    typeof task.verifierWorkerId === "number" &&
    task.verifierWorkerId !== meId;
  if (requiresVerification) {
    const submitted = await storage.submitForVerification(taskId);
    if (!submitted) {
      // Concurrent submit или статус не позволяет (approved/already
      // submitted). Отдаём текущий стейт.
      const fresh = await storage.getTask(taskId);
      return { outcome: "already", task: fresh ?? task };
    }
    const updatedTask = await storage.getTask(taskId);
    // КРИТИЧНО: тут возвращаемся БЕЗ запуска WeSetup-mirror и БЕЗ
    // credit'а balance. Mirror отправится только когда verifier
    // нажмёт «Принять» в WeSetup (см. POST /verifier endpoint там),
    // — до approve журнальный entry в WeSetup НЕ помечается
    // выполненным.
    return { outcome: "submitted", task: updatedTask ?? task };
  }

  // Race-safe атомарный переход isCompleted=false → true. Если
  // одновременные вызовы — только один получит true и начислит
  // баланс. Остальные получат transitioned=false и пропустят
  // updateUserBalance. Раньше storage.updateTask без conditional
  // WHERE → два concurrent POST'а оба видели isCompleted=false,
  // оба добавляли task.price → двойная оплата.
  const transitioned = await storage.transitionTaskToCompleted(taskId);
  if (!transitioned) {
    // Кто-то параллельно уже завершил — отдаём текущий стейт.
    const fresh = await storage.getTask(taskId);
    return { outcome: "already", task: fresh ?? task };
  }
  const updatedTask = await storage.getTask(taskId);
  if (!updatedTask) {
    throw new TaskServiceError(500, "Ошибка обновления задачи");
  }

  // Если у задачи есть стоимость и исполнитель, добавляем к балансу
  if (task.price && task.price > 0 && task.workerId) {
    await storage.updateUserBalance(task.workerId, task.price);
  }

  // Race-siblings: если задача журнальная (любая, не только с премией),
  // помечаем sibling-задачи (тот же documentId+kind+rowKey-scope, другие
  // воркеры, невыполненные) как «забранные» победителем — они переедут в
  // раздел «Сделано другими» в дашборде.
  //
  // 2026-05-09 (соответствие П-2 спека Wesetup
  // 2026-05-09-wesetup-tasksflow-integration-design): убрали hasBonus
  // условие — ранее race-cleanup срабатывал ТОЛЬКО для бонусных задач,
  // что давало баг «у уборщика-2 задача не пропадает» в WeSetup
  // cleaning race-mode (где price=0). Теперь любая journal-linked задача
  // авто-маркирует sibling'ов при завершении.
  const journalLink = parseJournalLink(task.journalLink);
  if (journalLink && task.workerId && !journalLink.isFreeText) {
    try {
      const claimed = await storage.claimSiblingTasks({
        sourceTaskId: task.id,
        documentId: journalLink.documentId,
        journalKind: journalLink.kind,
        sourceRowKey: journalLink.rowKey ?? null,
        claimedByWorkerId: task.workerId,
        companyId: task.companyId ?? null,
        completedAt: Math.floor(Date.now() / 1000),
      });
      if (claimed > 0) {
        console.log(
          `[claim] task ${task.id} claimed ${claimed} sibling(s) for ${journalLink.kind}/${journalLink.documentId}`,
        );
      }
    } catch (claimErr) {
      // Не валим основное завершение если claim не прошёл — задача
      // выполнена, баланс начислен; sibling-claim это «приятный
      // бонус» UX'а, а не critical path.
      console.error("[claim] failed", claimErr);
    }
  }

  // Отправляем email на email компании с прикрепленными фото (если есть)
  const worker = task.workerId ? await storage.getUserById(task.workerId) : null;
  const workerName = worker?.name || worker?.phone || "Неизвестный";
  // Получаем email компании для уведомления (из api-key или session-юзера).
  const company = callerCompanyId
    ? await storage.getCompanyById(callerCompanyId)
    : null;
  sendTaskCompletedEmail(
    task.title,
    workerName,
    taskPhotoUrls.length > 0
      ? taskPhotoUrls
      : task.photoUrl
        ? [task.photoUrl]
        : null,
    company?.email,
    comment ?? undefined,
  );

  // Audit log (П-17 спека Wesetup): фиксируем completion event для
  // объединённого audit-report'а на стороне Wesetup.
  const { recordAudit } = await import("../audit-log");
  void recordAudit({
    companyId: task.companyId,
    actorWorkerId: task.workerId,
    taskId: task.id,
    action: "task.completed",
    payload: {
      title: task.title,
      workerName,
      hasPhoto: taskPhotoUrls.length > 0 || Boolean(task.photoUrl),
      comment: comment ?? null,
    },
  });

  return { outcome: "completed", task: updatedTask };
}
