import { useAuth } from "@/contexts/AuthContext";

/**
 * Права в кабинете (как на сервере):
 *   • админ (isAdmin) — всё в своей компании;
 *   • руководитель — managedWorkerIds задан (с WeSetup): свои и подчинённые,
 *     создаёт и правит задачи в этом круге;
 *   • сотрудник — только свои задачи;
 *   • root — владелец сервиса (users.is_root), свои разделы.
 */
export function usePermissions() {
  const { user } = useAuth();
  const extra = (user ?? {}) as { isRoot?: boolean; managedWorkerIds?: string | null };
  const isAdmin = Boolean(user?.isAdmin);
  const isManager = Boolean(user) && !isAdmin && hasManagedWorkers(extra.managedWorkerIds);
  return { isAdmin, isManager, isRoot: Boolean(extra.isRoot), canManageTasks: isAdmin || isManager };
}

function hasManagedWorkers(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    return Array.isArray(JSON.parse(raw));
  } catch {
    return false;
  }
}
