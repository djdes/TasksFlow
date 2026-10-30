import { z } from "zod";

/**
 * Роли и права в компании — одна модель для сервера и кабинета.
 *
 *   Администратор (users.is_admin) — всё: настройки компании, оплата, роли,
 *     все задачи и сотрудники.
 *   Своя роль (company_roles, users.role_id) — например «Руководитель»:
 *     набор прав ниже. Настройки компании и оплату не видит никогда.
 *   Руководитель из WeSetup (users.managed_worker_ids) — ставит задачи и
 *     проверяет работу своих людей, как раньше.
 *   Сотрудник — свои задачи. Выполненные могут уходить на проверку
 *     (настройка компании employeeApproval).
 */

export const PERMISSION_KEYS = ["manageTasks", "manageUsers", "verifyTasks", "viewReports"] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type RolePermissions = Record<PermissionKey, boolean> & {
  /** Выполненные задачи людей с этой ролью уходят на проверку. */
  requiresApproval: boolean;
};

export const NO_PERMISSIONS: RolePermissions = {
  manageTasks: false,
  manageUsers: false,
  verifyTasks: false,
  viewReports: false,
  requiresApproval: false,
};

/** Подписи для формы роли и для карточек — одинаковые везде. */
export const PERMISSION_TEXT: Record<keyof RolePermissions, { title: string; hint: string }> = {
  manageTasks: {
    title: "Ставит задачи себе и другим",
    hint: "Создаёт, меняет и удаляет задачи любого сотрудника — как администратор",
  },
  manageUsers: {
    title: "Добавляет сотрудников",
    hint: "Добавляет людей, меняет им PIN, должность и роль. Админов и других руководителей не трогает",
  },
  verifyTasks: {
    title: "Принимает выполненные задачи",
    hint: "Видит раздел «На проверке»: принимает работу или возвращает на доработку",
  },
  viewReports: {
    title: "Видит историю и отчёты всей компании",
    hint: "Журнал дня, сводку и выгрузку CSV по всем сотрудникам",
  },
  requiresApproval: {
    title: "Выполненные задачи — на проверку",
    hint: "Отметка «Готово» отправляет задачу руководителю или админу. Премия начисляется после «Принять»",
  },
};

export const rolePermissionsSchema = z.object({
  manageTasks: z.boolean().default(false),
  manageUsers: z.boolean().default(false),
  verifyTasks: z.boolean().default(false),
  viewReports: z.boolean().default(false),
  requiresApproval: z.boolean().default(false),
});

/** Встроенные роли: своя роль с таким же именем только запутает. */
const RESERVED_NAMES = new Set(["администратор", "админ", "сотрудник"]);

export const roleInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Введите название роли")
    .max(60, "Название не длиннее 60 символов")
    .refine((v) => !RESERVED_NAMES.has(v.toLowerCase().replace(/ё/g, "е")), "Такая роль уже есть — придумайте другое название"),
  permissions: rolePermissionsSchema,
});
export type RoleInput = z.infer<typeof roleInputSchema>;

/** Заготовка для первой роли — то, о чём чаще всего просят. */
export const MANAGER_PRESET: RoleInput = {
  name: "Руководитель",
  permissions: { manageTasks: true, manageUsers: true, verifyTasks: true, viewReports: true, requiresApproval: false },
};

/** Права из колонки company_roles.permissions; мусор — без прав. */
export function parseRolePermissions(raw: string | null | undefined): RolePermissions {
  if (!raw) return { ...NO_PERMISSIONS };
  try {
    const parsed = rolePermissionsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : { ...NO_PERMISSIONS };
  } catch {
    return { ...NO_PERMISSIONS };
  }
}

// ---------------------------------------------------------------------------
// Настройки компании для встроенной роли «Сотрудник».

export type AccessSettings = { employeeApproval: boolean };

export const accessSettingsSchema = z.object({ employeeApproval: z.boolean() });

/**
 * Компании без сохранённой настройки работают как раньше — без проверки:
 * иначе выкладка молча поменяла бы порядок работы всем клиентам.
 */
export const DEFAULT_ACCESS: AccessSettings = { employeeApproval: false };

/** Новые компании: выполненная сотрудником задача идёт на проверку. */
export const NEW_COMPANY_ACCESS: AccessSettings = { employeeApproval: true };

export function parseAccessSettings(raw: string | null | undefined): AccessSettings {
  if (!raw) return { ...DEFAULT_ACCESS };
  try {
    const parsed = accessSettingsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : { ...DEFAULT_ACCESS };
  } catch {
    return { ...DEFAULT_ACCESS };
  }
}

// ---------------------------------------------------------------------------
// Права конкретного человека.

export type AccessKind = "admin" | "role" | "manager" | "employee";

export type UserAccess = {
  userId: number;
  kind: AccessKind;
  roleId: number | null;
  /** Для подписи в меню и списке сотрудников. */
  roleName: string;
  isAdmin: boolean;
  /** Ставит задачи (кому именно — taskScope). */
  manageTasks: boolean;
  manageUsers: boolean;
  /** Открывает «На проверке» (чью работу — reviewScope). */
  verifyTasks: boolean;
  /** История всей компании. */
  viewReports: boolean;
  requiresApproval: boolean;
  /** Чьи задачи видит и кому ставит: null — вся компания, иначе эти люди (с собой). */
  taskScope: number[] | null;
  /** Чью работу принимает: null — всю, иначе этих людей (без себя). */
  reviewScope: number[] | null;
  /** Чью историю видит: null — всю компанию. */
  reportScope: number[] | null;
};

export type AccessUser = {
  id: number;
  isAdmin: boolean;
  companyId?: number | null;
  managedWorkerIds?: string | null;
  roleId?: number | null;
};

export type AccessRole = {
  id: number;
  companyId: number;
  name: string;
  permissions: RolePermissions;
};

/** Роль компании, как её отдаёт GET /api/roles. */
export type CompanyRole = AccessRole & { createdAt: number; updatedAt: number };

/** Ответ GET /api/roles: свои роли и настройка встроенной роли «Сотрудник». */
export type RolesResponse = { roles: CompanyRole[]; employeeApproval: boolean };

/** Список подчинённых из WeSetup. Пусто или мусор — подчинённых нет. */
export function parseManagedIds(raw: string | null | undefined): number[] | null {
  if (raw === null || raw === undefined || raw === "") return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((n) => typeof n === "number" && Number.isInteger(n));
  } catch {
    return null;
  }
}

const uniq = (ids: number[]) => Array.from(new Set(ids));

export function resolveAccess(
  user: AccessUser,
  role: AccessRole | null | undefined,
  settings: AccessSettings = DEFAULT_ACCESS,
): UserAccess {
  if (user.isAdmin) {
    return {
      userId: user.id,
      kind: "admin",
      roleId: null,
      roleName: "Администратор",
      isAdmin: true,
      manageTasks: true,
      manageUsers: true,
      verifyTasks: true,
      viewReports: true,
      requiresApproval: false,
      taskScope: null,
      reviewScope: null,
      reportScope: null,
    };
  }

  const managed = parseManagedIds(user.managedWorkerIds);
  const team = managed ? uniq([...managed, user.id]) : [user.id];
  const subordinates = managed ? managed.filter((id) => id !== user.id) : [];
  // Роль чужой компании (перевели человека, а role_id остался) не действует.
  const own = role && (user.companyId == null || role.companyId === user.companyId) ? role : null;

  if (own) {
    const p = own.permissions;
    return {
      userId: user.id,
      kind: "role",
      roleId: own.id,
      roleName: own.name,
      isAdmin: false,
      manageTasks: p.manageTasks || managed !== null,
      manageUsers: p.manageUsers,
      verifyTasks: p.verifyTasks || managed !== null,
      viewReports: p.viewReports,
      requiresApproval: p.requiresApproval,
      taskScope: p.manageTasks ? null : team,
      reviewScope: p.verifyTasks ? null : subordinates,
      reportScope: p.viewReports ? null : team,
    };
  }

  if (managed !== null) {
    return {
      userId: user.id,
      kind: "manager",
      roleId: null,
      roleName: "Руководитель",
      isAdmin: false,
      manageTasks: true,
      manageUsers: false,
      verifyTasks: true,
      viewReports: false,
      requiresApproval: false,
      taskScope: team,
      reviewScope: subordinates,
      reportScope: team,
    };
  }

  return {
    userId: user.id,
    kind: "employee",
    roleId: null,
    roleName: "Сотрудник",
    isAdmin: false,
    manageTasks: false,
    manageUsers: false,
    verifyTasks: false,
    viewReports: false,
    requiresApproval: settings.employeeApproval,
    taskScope: [user.id],
    reviewScope: [],
    reportScope: [user.id],
  };
}

/**
 * С задачами всей компании обращается как админ: может отметить, вернуть
 * и поправить фото за исполнителя. Админ и роль с «Ставит задачи»;
 * руководитель из WeSetup — нет (у него только свои люди).
 */
export function isTaskAdmin(access: UserAccess): boolean {
  return access.isAdmin || (access.manageTasks && access.taskScope === null);
}

/** Видит задачи этого человека (или задачи без исполнителя при null). */
export function canSeeWorker(access: UserAccess, workerId: number | null | undefined): boolean {
  if (access.taskScope === null) return true;
  return workerId != null && access.taskScope.includes(workerId);
}

/**
 * Может назначить задачу этому человеку. Без исполнителя — только тот, кто
 * ставит задачи всей компании (админ или роль с «Ставит задачи»).
 */
export function canAssignTo(access: UserAccess, workerId: number | null | undefined): boolean {
  if (access.isAdmin) return true;
  if (access.manageTasks && access.taskScope === null) return true;
  if (!workerId) return false;
  if (workerId === access.userId) return true;
  return access.manageTasks && !!access.taskScope?.includes(workerId);
}

/**
 * Может принять или вернуть эту задачу. Свою работу не принимает никто,
 * кроме админа. Назначенного проверяющего (WeSetup) подменяют только админ
 * и те, кто проверяет всю компанию.
 */
export function canReviewTask(
  access: UserAccess,
  task: { workerId: number | null; verifierWorkerId?: number | null },
): boolean {
  if (access.isAdmin) return true;
  // Своя работа — даже если человек сам назначен проверяющим.
  if (task.workerId != null && task.workerId === access.userId) return false;
  if (task.verifierWorkerId != null && task.verifierWorkerId === access.userId) return true;
  if (!access.verifyTasks) return false;
  if (access.reviewScope === null) return true;
  if (task.verifierWorkerId != null) return false;
  return task.workerId != null && access.reviewScope.includes(task.workerId);
}

/**
 * «Руководитель» в смысле прав над людьми: его не трогает другой
 * руководитель. Админ, роль с «Добавляет сотрудников» и руководитель из
 * WeSetup (у него есть свои люди).
 */
export function isPeopleManager(
  target: { isAdmin: boolean; managedWorkerIds?: string | null },
  targetRole: Pick<AccessRole, "permissions"> | null | undefined,
): boolean {
  return target.isAdmin || !!targetRole?.permissions.manageUsers || parseManagedIds(target.managedWorkerIds) !== null;
}

/**
 * Может менять этого человека (имя, телефон, PIN, роль, удаление).
 * Админ — любого в компании (свои правила есть у PIN и удаления админов).
 * Роль с «Добавляет сотрудников» — только обычных людей, не себя.
 */
export function canManageUser(
  access: UserAccess,
  target: { id: number; isAdmin: boolean; managedWorkerIds?: string | null },
  targetRole: Pick<AccessRole, "permissions"> | null | undefined,
): boolean {
  if (access.isAdmin) return true;
  if (!access.manageUsers) return false;
  if (target.id === access.userId) return false;
  return !isPeopleManager(target, targetRole);
}

/**
 * Какую роль может выдать. "admin" — права администратора, null — сотрудник.
 * Руководитель выдаёт только роли без права на людей (иначе он создал бы
 * себе равного, а тот — следующего) и не шире своих прав: роль «Кадровик»
 * не сделает человека «Старшим» с задачами и отчётами всей компании.
 */
export function canGrantRole(
  access: UserAccess,
  grant: "admin" | Pick<AccessRole, "permissions"> | null,
): boolean {
  if (access.isAdmin) return true;
  if (!access.manageUsers) return false;
  if (grant === "admin") return false;
  if (grant === null) return true;
  const p = grant.permissions;
  if (p.manageUsers) return false;
  if (p.manageTasks && !(access.manageTasks && access.taskScope === null)) return false;
  if (p.verifyTasks && !(access.verifyTasks && access.reviewScope === null)) return false;
  if (p.viewReports && !(access.viewReports && access.reportScope === null)) return false;
  return true;
}
