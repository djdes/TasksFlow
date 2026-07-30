/**
 * Прикрепление уже сохранённого на диск фото к задаче или пункту чек-листа.
 *
 * Извлечено из inline-хендлеров POST /api/tasks/:id/photo и
 * POST /api/tasks/:id/checklist/:itemId/photo. Приём файла (multer, лимит
 * 10 МБ, allowlist mime, cleanup orphan-файла) остаётся в роуте — сервис
 * получает уже готовый `/uploads/<filename>` и отвечает только за проверки
 * прав и запись в БД. Telegram-бот сам кладёт файл в uploads/ через getFile
 * и зовёт эти же функции.
 */

import type { Task } from "@shared/schema";
import { storage } from "../storage";
import {
  actorUserId,
  TaskServiceError,
  type TaskActor,
} from "./task-actor";

/** Общая часть: найти задачу, проверить компанию и права исполнителя. */
async function loadTaskForPhoto(
  taskId: number,
  actor: TaskActor,
): Promise<Task> {
  const task = await storage.getTask(taskId);
  if (!task) {
    throw new TaskServiceError(404, "Задача не найдена");
  }

  if (actor.kind === "apiKey") {
    // Multi-tenant scope-check для машинной интеграции.
    if (task.companyId !== actor.companyId) {
      throw new TaskServiceError(404, "Задача не найдена");
    }
    return task;
  }

  const meId = actorUserId(actor);
  const currentUser = await storage.getUserById(meId!);
  // Multi-tenant scope-check: задача должна принадлежать компании
  // текущего юзера (защита от cross-tenant photo upload).
  if (currentUser?.companyId != null && task.companyId !== currentUser.companyId) {
    throw new TaskServiceError(404, "Задача не найдена");
  }

  // Проверяем права: исполнитель или админ
  const isAllowed = currentUser?.isAdmin || task.workerId === meId;
  if (!isAllowed) {
    throw new TaskServiceError(403, "Вы не являетесь исполнителем этой задачи");
  }

  return task;
}

export type AttachTaskPhotoResult = {
  photoUrl: string;
  photoUrls: string[];
  task: Task;
};

/** Фото к самой задаче. Лимит — 10 штук. */
export async function attachTaskPhoto({
  taskId,
  photoUrl,
  actor,
}: {
  taskId: number;
  photoUrl: string;
  actor: TaskActor;
}): Promise<AttachTaskPhotoResult> {
  const task = await loadTaskForPhoto(taskId, actor);

  // Проверяем лимит фотографий (максимум 10)
  const currentPhotos = task.photoUrls || [];
  if (currentPhotos.length >= 10) {
    throw new TaskServiceError(400, "Достигнут лимит фотографий (максимум 10)");
  }

  // Добавляем новое фото в массив
  const newPhotoUrls = [...currentPhotos, photoUrl];
  const updatedTask = await storage.updateTask(taskId, {
    photoUrls: newPhotoUrls,
    photoUrl, // Для обратной совместимости, храним последнее фото
  });
  if (!updatedTask) {
    throw new TaskServiceError(500, "Ошибка обновления задачи");
  }

  return {
    photoUrl,
    photoUrls: updatedTask.photoUrls || [],
    task: updatedTask,
  };
}

/**
 * Фото к пункту чек-листа → пункт помечается выполненным.
 * Фото на каждый пункт обязательно (галочку без фото не поставить).
 * Лимит — 5 фото на пункт.
 */
export async function attachChecklistItemPhoto({
  taskId,
  itemId,
  photoUrl,
  actor,
}: {
  taskId: number;
  itemId: string;
  photoUrl: string;
  actor: TaskActor;
}): Promise<{ photoUrl: string; task: Task }> {
  const task = await loadTaskForPhoto(taskId, actor);

  const checklist = task.checklist || [];
  const idx = checklist.findIndex((it) => it.id === itemId);
  if (idx === -1) {
    throw new TaskServiceError(404, "Пункт чек-листа не найден");
  }
  if ((checklist[idx].photoUrls?.length ?? 0) >= 5) {
    throw new TaskServiceError(400, "Достигнут лимит фото на пункт (5)");
  }

  const newChecklist = checklist.map((it, i) =>
    i === idx
      ? { ...it, done: true, photoUrls: [...(it.photoUrls || []), photoUrl] }
      : it,
  );
  const updatedTask = await storage.updateTask(taskId, {
    checklist: newChecklist,
  });
  if (!updatedTask) {
    throw new TaskServiceError(500, "Ошибка обновления задачи");
  }

  return { photoUrl, task: updatedTask };
}
