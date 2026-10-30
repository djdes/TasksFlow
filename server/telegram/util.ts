/**
 * Мелкие хелперы бота без зависимостей от остальных его модулей.
 *
 * Живут отдельно намеренно: раньше escapeHtml и canCreateTasks лежали в
 * handle-update, и cards/my-tasks/handle-callback импортировали его ради
 * двух функций — получался цикл импортов, где значение могло оказаться
 * undefined в зависимости от порядка загрузки.
 */

import type { User } from "@shared/schema";
import { DatabaseStorage } from "../storage";

/**
 * Экранирование для parse_mode=HTML.
 *
 * Обязательно для всего, что пришло от пользователя или от AI: незакрытый
 * тег ломает не вёрстку, а весь sendMessage — Telegram отвечает 400 и
 * сообщение не доходит вовсе.
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Может ли пользователь ставить задачи: админ или руководитель с
 * непустым списком подчинённых. Обычный воркер — нет, ему /tasks.
 */
export function canCreateTasks(user: User): boolean {
  if (user.isAdmin) return true;
  const managed = DatabaseStorage.parseManagedWorkerIds(user.managedWorkerIds);
  return Array.isArray(managed) && managed.length > 0;
}

/**
 * То же с учётом своей роли компании (shared/roles.ts): роль «Ставит
 * задачи» ставит их в боте, как в кабинете. Без role_id в БД не ходим.
 */
export async function canCreateTasksNow(user: User): Promise<boolean> {
  if (canCreateTasks(user)) return true;
  if (typeof user.roleId !== "number") return false;
  const { accessOf } = await import("../access");
  const access = await accessOf(user);
  return access.manageTasks && access.taskScope === null;
}
