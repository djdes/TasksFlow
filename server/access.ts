/**
 * Права человека на сервере — обёртка над shared/roles.ts, которая знает,
 * где взять роль и настройки компании.
 *
 * В БД ходим только когда это меняет ответ: у человека без своей роли
 * (role_id NULL) права считаются по одной его строке. Настройки компании
 * нужны лишь для «Сотрудника» — уходит ли его выполненная задача на
 * проверку, — поэтому их читает только accessWithApproval().
 */
import type { User } from "@shared/schema";
import {
  DEFAULT_ACCESS,
  parseAccessSettings,
  resolveAccess,
  type AccessRole,
  type AccessSettings,
  type UserAccess,
} from "@shared/roles";
import { storage } from "./storage";

type AccessSubject = Pick<User, "id" | "isAdmin" | "companyId" | "managedWorkerIds"> & { roleId?: number | null };

/** Своя роль человека или null. Без role_id в БД не ходим. */
export async function roleOf(user: { roleId?: number | null }): Promise<AccessRole | null> {
  if (typeof user.roleId !== "number") return null;
  return (await storage.getCompanyRole(user.roleId)) ?? null;
}

/** Права без настроек компании: кто что ставит, видит и проверяет. */
export async function accessOf(user: AccessSubject): Promise<UserAccess> {
  return resolveAccess(user, await roleOf(user), DEFAULT_ACCESS);
}

/** Настройки встроенной роли «Сотрудник» у компании. */
export async function accessSettingsOf(companyId: number | null | undefined): Promise<AccessSettings> {
  if (!companyId) return { ...DEFAULT_ACCESS };
  const company = await storage.getCompanyById(companyId);
  return parseAccessSettings(company?.accessSettings);
}

/**
 * Права вместе с «уходит ли выполненное на проверку». Для сотрудника без
 * роли это настройка компании, поэтому здесь читаем и её.
 */
export async function accessWithApproval(user: AccessSubject): Promise<UserAccess> {
  const role = await roleOf(user);
  const access = resolveAccess(user, role, DEFAULT_ACCESS);
  // Настройка компании нужна только «Сотруднику» — тому, кого resolveAccess
  // им и признал (без роли, без своих людей, роль чужой компании не в счёт).
  if (access.kind !== "employee") return access;
  return resolveAccess(user, role, await accessSettingsOf(user.companyId));
}

/**
 * Права всех людей компании разом: роли и настройки читаются один раз.
 * Для рассылок и выбора проверяющих.
 */
export async function accessMap(
  companyId: number,
  users: readonly AccessSubject[],
  opts: { withApproval?: boolean } = {},
): Promise<Map<number, UserAccess>> {
  const roles = users.some((u) => typeof u.roleId === "number") ? await storage.listCompanyRoles(companyId) : [];
  const byId = new Map<number, AccessRole>(roles.map((r) => [r.id, r]));
  const settings = opts.withApproval ? await accessSettingsOf(companyId) : DEFAULT_ACCESS;
  return new Map(
    users.map((u) => [u.id, resolveAccess(u, typeof u.roleId === "number" ? byId.get(u.roleId) ?? null : null, settings)]),
  );
}
