import { useAuth } from "@/contexts/AuthContext";
import { resolveAccess, type UserAccess } from "@shared/roles";

/**
 * Права в кабинете — те же, что на сервере (shared/roles.ts). Сервер
 * отдаёт их в /api/auth/me (user.access); если поля нет (старый сервер,
 * демо), считаем по строке пользователя без своей роли.
 *
 *   • админ — всё в своей компании;
 *   • своя роль (например «Руководитель») — по её правам: задачи, люди,
 *     проверка, отчёты; настройки компании и оплата — никогда;
 *   • руководитель из WeSetup — свои люди;
 *   • сотрудник — только свои задачи;
 *   • root — владелец сервиса (users.is_root), свои разделы.
 */
export function usePermissions() {
  const { user } = useAuth();
  const extra = (user ?? {}) as { isRoot?: boolean; managedWorkerIds?: string | null; companyId?: number | null };
  const access: UserAccess | null = user
    ? user.access ?? resolveAccess({ id: user.id, isAdmin: user.isAdmin, managedWorkerIds: extra.managedWorkerIds, companyId: extra.companyId }, null)
    : null;
  const isAdmin = Boolean(access?.isAdmin);
  return {
    access,
    isAdmin,
    isManager: Boolean(access) && !isAdmin && (access!.manageTasks || access!.manageUsers || access!.verifyTasks),
    isRoot: Boolean(extra.isRoot),
    roleName: access?.roleName ?? "Сотрудник",
    canManageTasks: Boolean(access?.manageTasks),
    canManageUsers: Boolean(access?.manageUsers),
    canVerify: Boolean(access?.verifyTasks),
    canViewReports: Boolean(access?.viewReports),
    /** Ведёт задачи всей компании, как админ (фильтр по людям, «Дублировать»). */
    tasksCompanyWide: Boolean(access) && (isAdmin || (access!.manageTasks && access!.taskScope === null)),
  };
}
