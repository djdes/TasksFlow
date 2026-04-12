export const USER_ROLE_VALUES = [
  "manager",
  "head_chef",
  "cook",
  "waiter",
] as const;

export const LEGACY_USER_ROLE_VALUES = [
  "owner",
  "technologist",
  "operator",
] as const;

export type UserRole = (typeof USER_ROLE_VALUES)[number];
export type LegacyUserRole = (typeof LEGACY_USER_ROLE_VALUES)[number];
export type KnownUserRole = UserRole | LegacyUserRole;

export type UserLike = {
  id?: string;
  name: string;
  role: string;
};

const LEGACY_TO_ROLE: Record<string, UserRole> = {
  owner: "manager",
  technologist: "head_chef",
  operator: "cook",
};

const ROLE_TO_LEGACY: Partial<Record<UserRole, string[]>> = {
  manager: ["owner"],
  head_chef: ["technologist"],
  cook: ["operator"],
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  manager: "Управляющий",
  head_chef: "Шеф-повар",
  cook: "Повар",
  waiter: "Официант",
};

export const USER_ROLE_OPTIONS = USER_ROLE_VALUES.map((value) => ({
  value,
  label: USER_ROLE_LABELS[value],
}));

export const USER_ROLE_LABEL_VALUES = USER_ROLE_OPTIONS.map(
  (option) => option.label
);

export const MANAGER_ROLES: UserRole[] = ["manager"];
export const MANAGEMENT_ROLES: UserRole[] = ["manager", "head_chef"];
export const STAFF_ROLES: UserRole[] = ["head_chef", "cook", "waiter"];

export function isUserRoleValue(role: string | null | undefined): role is UserRole {
  return !!role && USER_ROLE_VALUES.includes(role as UserRole);
}

export function isLegacyUserRoleValue(
  role: string | null | undefined
): role is LegacyUserRole {
  return !!role && LEGACY_USER_ROLE_VALUES.includes(role as LegacyUserRole);
}

export function normalizeUserRole(role: string | null | undefined): string {
  if (!role) return "cook";
  return LEGACY_TO_ROLE[role] || role;
}

export function toCanonicalUserRole(
  role: string | null | undefined,
  fallback: UserRole = "cook"
): UserRole {
  const normalized = normalizeUserRole(role);
  return isUserRoleValue(normalized) ? normalized : fallback;
}

export function getUserRoleLabel(role: string | null | undefined): string {
  const normalized = normalizeUserRole(role);
  if (normalized in USER_ROLE_LABELS) {
    return USER_ROLE_LABELS[normalized as UserRole];
  }

  return normalized || "Сотрудник";
}

/**
 * Resolve the display title for an employee on a journal. Prefers the free-form
 * `positionTitle` stored on the User record, falling back to the role-based label
 * so unmigrated data keeps working. Use this instead of `getUserRoleLabel(role)`
 * whenever a journal needs to show "what this person does" — otherwise a cook
 * working the hot kitchen can end up labelled identically to the bar cook, or a
 * legacy `waiter` role ends up overwriting a more specific title.
 */
export function getUserDisplayTitle(
  user: { role?: string | null; positionTitle?: string | null } | null | undefined
): string {
  const raw = typeof user?.positionTitle === "string" ? user.positionTitle.trim() : "";
  if (raw) return raw;
  return getUserRoleLabel(user?.role);
}

export function getPermissionRole(role: string | null | undefined): string {
  switch (normalizeUserRole(role)) {
    case "manager":
      return "owner";
    case "head_chef":
      return "technologist";
    default:
      return "operator";
  }
}

export function getUserRoleGroupLabel(role: string | null | undefined): string {
  return isManagerRole(role) ? "Руководство" : "Сотрудники";
}

export function getUserRoleSortOrder(role: string | null | undefined): number {
  switch (normalizeUserRole(role)) {
    case "manager":
      return 0;
    case "head_chef":
      return 1;
    case "cook":
      return 2;
    case "waiter":
      return 3;
    default:
      return 4;
  }
}

export function getDistinctRoleLabels(users: Array<Pick<UserLike, "role">>): string[] {
  return [...new Set(users.map((user) => getUserRoleLabel(user.role)))];
}

export function getUsersForRoleLabel<T extends Pick<UserLike, "role">>(
  users: T[],
  roleLabel: string
): T[] {
  return users.filter((user) => getUserRoleLabel(user.role) === roleLabel);
}

export function hasAnyUserRole(
  role: string | null | undefined,
  allowedRoles: readonly string[]
): boolean {
  return allowedRoles.includes(normalizeUserRole(role));
}

export function hasNormalizedUserRole(
  role: string | null | undefined,
  expectedRole: UserRole
): boolean {
  return normalizeUserRole(role) === expectedRole;
}

export function pickUserByRolePriority<
  T extends { role?: string | null }
>(users: T[], roles: readonly UserRole[]): T | null {
  for (const role of roles) {
    const match = users.find((user) => hasNormalizedUserRole(user.role, role));
    if (match) {
      return match;
    }
  }

  return users[0] || null;
}

export function isManagerRole(role: string | null | undefined): boolean {
  return hasAnyUserRole(role, MANAGER_ROLES);
}

export function isManagementRole(role: string | null | undefined): boolean {
  return hasAnyUserRole(role, MANAGEMENT_ROLES);
}

export function getDbRoleValuesWithLegacy(
  roles: readonly UserRole[]
): string[] {
  return [...new Set(roles.flatMap((role) => [role, ...(ROLE_TO_LEGACY[role] || [])]))];
}

export function pickPrimaryManager<T extends { role?: string | null }>(
  users: T[]
): T | null {
  return pickUserByRolePriority(users, ["manager", "head_chef"]);
}

export function pickPrimaryStaff<T extends { role?: string | null }>(
  users: T[]
): T | null {
  return pickUserByRolePriority(users, ["cook", "waiter", "head_chef", "manager"]);
}
