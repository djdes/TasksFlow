import { z } from "zod";
import { canManageUser, type AccessRole, type UserAccess } from "./roles";

/**
 * Личный QR входа: сотрудник сканирует и сразу оказывается в своём аккаунте,
 * без телефона и PIN. Это ключ от аккаунта — выдаёт его только тот, кто
 * вправе менять этого человека, и никогда для администраторов и root.
 * Старый QR перестаёт работать, когда руководитель делает новый или
 * отключает вход по QR, и когда сотрудника удаляют.
 */
export const USER_LOGIN_PATH = "/api/user-login";
export const USER_LOGIN_PAGE = "/login/qr";
export const userLoginTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);

export type UserLoginLink = { url: string | null; createdAt: number | null };

export function canIssueLoginLink(
  access: UserAccess,
  target: { id: number; isAdmin: boolean; isRoot?: boolean | null; companyId?: number | null; managedWorkerIds?: string | null },
  targetRole: Pick<AccessRole, "permissions"> | null | undefined,
  actorCompanyId: number | null | undefined,
): boolean {
  if (target.isAdmin || target.isRoot) return false;
  if (!actorCompanyId || target.companyId !== actorCompanyId) return false;
  if (target.id === access.userId) return false;
  return canManageUser(access, target, targetRole);
}
