/**
 * Роли и права (shared/roles.ts): кто что ставит, кого меняет, чью работу
 * принимает и чья выполненная задача уходит на проверку.
 */
import { describe, expect, it } from "vitest";
import {
  canAssignTo,
  canGrantRole,
  canManageUser,
  canReviewTask,
  canSeeWorker,
  isTaskAdmin,
  MANAGER_PRESET,
  NO_PERMISSIONS,
  parseAccessSettings,
  parseRolePermissions,
  resolveAccess,
  roleInputSchema,
  type AccessRole,
} from "../shared/roles";
import { parseNotifyPrefs, DEFAULT_PREFS } from "../shared/notify";

const role = (id: number, permissions: Partial<AccessRole["permissions"]>, companyId = 1): AccessRole => ({
  id,
  companyId,
  name: `Роль ${id}`,
  permissions: { ...NO_PERMISSIONS, ...permissions },
});

const LEAD = role(3, MANAGER_PRESET.permissions);
const SENIOR = role(4, { manageTasks: true }); // старший смены: задачи, но не люди
const CHECKER = role(5, { verifyTasks: true });
const TRAINEE = role(6, { requiresApproval: true });

const admin = { id: 1, isAdmin: true, companyId: 1 };
const lead = { id: 2, isAdmin: false, companyId: 1, roleId: 3 };
const worker = { id: 10, isAdmin: false, companyId: 1 };
const chef = { id: 12, isAdmin: false, companyId: 1, managedWorkerIds: "[10,11]" };

describe("resolveAccess", () => {
  it("админ — всё, без проверки своих задач", () => {
    const a = resolveAccess(admin, null);
    expect(a).toMatchObject({ kind: "admin", roleName: "Администратор", manageTasks: true, manageUsers: true, requiresApproval: false });
    expect(a.taskScope).toBeNull();
  });

  it("роль «Руководитель» — как админ в задачах и людях, вся компания", () => {
    const a = resolveAccess(lead, LEAD);
    expect(a).toMatchObject({ kind: "role", roleName: "Роль 3", isAdmin: false, manageTasks: true, manageUsers: true, verifyTasks: true, viewReports: true });
    expect(a.taskScope).toBeNull();
    expect(a.reviewScope).toBeNull();
    expect(a.reportScope).toBeNull();
    expect(isTaskAdmin(a)).toBe(true);
  });

  it("сотрудник: проверка выполненного — по настройке компании", () => {
    expect(resolveAccess(worker, null).requiresApproval).toBe(false);
    expect(resolveAccess(worker, null, { employeeApproval: true })).toMatchObject({ kind: "employee", requiresApproval: true, taskScope: [10] });
  });

  it("роль решает сама за себя, настройка «Сотрудника» на неё не влияет", () => {
    expect(resolveAccess({ ...worker, roleId: 6 }, TRAINEE).requiresApproval).toBe(true);
    expect(resolveAccess({ ...worker, roleId: 4 }, SENIOR, { employeeApproval: true }).requiresApproval).toBe(false);
  });

  it("руководитель из WeSetup — свои люди и он сам", () => {
    const a = resolveAccess(chef, null);
    expect(a).toMatchObject({ kind: "manager", manageTasks: true, manageUsers: false, verifyTasks: true });
    expect(a.taskScope).toEqual([10, 11, 12]);
    expect(a.reviewScope).toEqual([10, 11]);
    expect(isTaskAdmin(a)).toBe(false);
  });

  it("роль чужой компании не действует", () => {
    expect(resolveAccess({ ...worker, roleId: 3 }, role(3, MANAGER_PRESET.permissions, 99)).kind).toBe("employee");
  });
});

describe("задачи", () => {
  it("руководитель с ролью ставит задачи любому и без исполнителя, как админ", () => {
    const a = resolveAccess(lead, LEAD);
    expect(canAssignTo(a, 10)).toBe(true);
    expect(canAssignTo(a, null)).toBe(true);
    expect(canSeeWorker(a, 99)).toBe(true);
  });

  it("руководитель из WeSetup — только своим; сотрудник — никому", () => {
    const c = resolveAccess(chef, null);
    expect(canAssignTo(c, 10)).toBe(true);
    expect(canAssignTo(c, 12)).toBe(true);
    expect(canAssignTo(c, 13)).toBe(false);
    expect(canAssignTo(c, null)).toBe(false);
    const w = resolveAccess(worker, null);
    expect(canAssignTo(w, 11)).toBe(false);
    expect(canSeeWorker(w, 10)).toBe(true);
    expect(canSeeWorker(w, 11)).toBe(false);
  });
});

describe("проверка выполненного", () => {
  const submitted = (workerId: number, verifierWorkerId: number | null = null) => ({ workerId, verifierWorkerId });

  it("роль «Принимает задачи» — работу всей компании, но не свою", () => {
    const a = resolveAccess({ ...worker, id: 20, roleId: 5 }, CHECKER);
    expect(canReviewTask(a, submitted(10))).toBe(true);
    expect(canReviewTask(a, submitted(20))).toBe(false);
    // Назначенного проверяющего подменяет: проверяет всю компанию.
    expect(canReviewTask(a, submitted(10, 77))).toBe(true);
  });

  it("руководитель из WeSetup — своих людей без назначенного проверяющего", () => {
    const c = resolveAccess(chef, null);
    expect(canReviewTask(c, submitted(10))).toBe(true);
    expect(canReviewTask(c, submitted(13))).toBe(false);
    expect(canReviewTask(c, submitted(10, 77))).toBe(false);
    expect(canReviewTask(c, submitted(13, 12))).toBe(true); // он и есть проверяющий
  });

  it("назначенный проверяющий не принимает свою же задачу", () => {
    const c = resolveAccess(chef, null);
    expect(canReviewTask(c, submitted(12, 12))).toBe(false);
    expect(canReviewTask(resolveAccess(admin, null), submitted(1, 1))).toBe(true); // админ — может
  });

  it("сотрудник не принимает ничью работу", () => {
    expect(canReviewTask(resolveAccess(worker, null), submitted(11))).toBe(false);
  });
});

describe("люди", () => {
  const leadAccess = resolveAccess(lead, LEAD);

  it("руководитель меняет обычных людей, но не админов, не других руководителей и не себя", () => {
    expect(canManageUser(leadAccess, { id: 10, isAdmin: false }, null)).toBe(true);
    expect(canManageUser(leadAccess, { id: 11, isAdmin: false }, SENIOR)).toBe(true);
    expect(canManageUser(leadAccess, { id: 1, isAdmin: true }, null)).toBe(false);
    expect(canManageUser(leadAccess, { id: 7, isAdmin: false }, LEAD)).toBe(false);
    expect(canManageUser(leadAccess, { id: 2, isAdmin: false }, LEAD)).toBe(false);
  });

  it("выдаёт роли без права на людей; админа — только админ", () => {
    expect(canGrantRole(leadAccess, null)).toBe(true);
    expect(canGrantRole(leadAccess, SENIOR)).toBe(true);
    expect(canGrantRole(leadAccess, LEAD)).toBe(false);
    expect(canGrantRole(leadAccess, "admin")).toBe(false);
    expect(canGrantRole(resolveAccess(admin, null), "admin")).toBe(true);
  });

  it("не выдаёт роль шире своих прав", () => {
    // «Кадровик» добавляет людей, но задачами и отчётами не управляет.
    const hr = resolveAccess({ ...worker, id: 30, roleId: 7 }, role(7, { manageUsers: true }));
    expect(canGrantRole(hr, null)).toBe(true);
    expect(canGrantRole(hr, TRAINEE)).toBe(true); // только «своё — на проверку»
    expect(canGrantRole(hr, SENIOR)).toBe(false);
    expect(canGrantRole(hr, CHECKER)).toBe(false);
    expect(canGrantRole(hr, role(8, { viewReports: true }))).toBe(false);
  });

  it("руководителя из WeSetup меняет только админ", () => {
    expect(canManageUser(leadAccess, { id: 12, isAdmin: false, managedWorkerIds: "[10]" }, null)).toBe(false);
    expect(canManageUser(leadAccess, { id: 13, isAdmin: false, managedWorkerIds: null }, null)).toBe(true);
    expect(canManageUser(resolveAccess(admin, null), { id: 12, isAdmin: false, managedWorkerIds: "[10]" }, null)).toBe(true);
  });

  it("роль без «Добавляет сотрудников» людей не трогает", () => {
    const senior = resolveAccess({ ...worker, roleId: 4 }, SENIOR);
    expect(canManageUser(senior, { id: 11, isAdmin: false }, null)).toBe(false);
    expect(canGrantRole(senior, null)).toBe(false);
  });
});

describe("разбор настроек", () => {
  it("права роли: мусор — без прав, недостающее — выключено", () => {
    expect(parseRolePermissions(null)).toEqual(NO_PERMISSIONS);
    expect(parseRolePermissions("{сломано")).toEqual(NO_PERMISSIONS);
    expect(parseRolePermissions('{"manageTasks":true}')).toEqual({ ...NO_PERMISSIONS, manageTasks: true });
  });

  it("настройка «Сотрудника»: пусто — без проверки (как раньше)", () => {
    expect(parseAccessSettings(null)).toEqual({ employeeApproval: false });
    expect(parseAccessSettings('{"employeeApproval":true}')).toEqual({ employeeApproval: true });
    expect(parseAccessSettings("[]")).toEqual({ employeeApproval: false });
  });

  it("название роли: обязательно, до 60 символов, не как встроенная", () => {
    expect(roleInputSchema.safeParse({ name: "  Руководитель ", permissions: {} }).success).toBe(true);
    expect(roleInputSchema.safeParse({ name: " ", permissions: {} }).success).toBe(false);
    expect(roleInputSchema.safeParse({ name: "x".repeat(61), permissions: {} }).success).toBe(false);
    expect(roleInputSchema.safeParse({ name: "Администратор", permissions: {} }).success).toBe(false);
    expect(roleInputSchema.safeParse({ name: "сотрудник", permissions: {} }).success).toBe(false);
  });

  it("личные уведомления: пусто — push включён, письма — по желанию; известные пункты — поверх", () => {
    expect(parseNotifyPrefs(null)).toEqual(DEFAULT_PREFS);
    expect(DEFAULT_PREFS.newTask).toBe(true);
    expect(DEFAULT_PREFS.emailNewTask).toBe(false);
    expect(parseNotifyPrefs('{"emailNewTask":true}')).toEqual({ ...DEFAULT_PREFS, emailNewTask: true });
    expect(parseNotifyPrefs('{"newTask":"да"}')).toEqual(DEFAULT_PREFS);
  });
});
