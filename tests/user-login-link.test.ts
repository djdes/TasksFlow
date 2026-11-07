import { describe, it, expect } from "vitest";
import { canIssueLoginLink, userLoginTokenSchema } from "../shared/user-login-link";
import { resolveAccess } from "../shared/roles";

const company = 7;
const admin = resolveAccess({ id: 1, isAdmin: true, companyId: company, managedWorkerIds: null, roleId: null } as never, null);
const worker = { id: 5, isAdmin: false, isRoot: false, companyId: company, managedWorkerIds: null };

// Личный QR входа — ключ от аккаунта без PIN: кому его можно выдать.
describe("canIssueLoginLink", () => {
  it("админ выдаёт QR обычному сотруднику своей компании", () => {
    expect(canIssueLoginLink(admin, worker, null, company)).toBe(true);
  });
  it("никогда — администратору, root, себе и чужой компании", () => {
    expect(canIssueLoginLink(admin, { ...worker, isAdmin: true }, null, company)).toBe(false);
    expect(canIssueLoginLink(admin, { ...worker, isRoot: true }, null, company)).toBe(false);
    expect(canIssueLoginLink(admin, { ...worker, id: 1 }, null, company)).toBe(false);
    expect(canIssueLoginLink(admin, { ...worker, companyId: 8 }, null, company)).toBe(false);
  });
  it("сотрудник без права на людей — нет", () => {
    const employee = resolveAccess({ id: 9, isAdmin: false, companyId: company, managedWorkerIds: null, roleId: null } as never, null);
    expect(canIssueLoginLink(employee, worker, null, company)).toBe(false);
  });
  it("токен — ровно 64 hex-символа", () => {
    expect(userLoginTokenSchema.safeParse("a".repeat(64)).success).toBe(true);
    expect(userLoginTokenSchema.safeParse("a".repeat(63)).success).toBe(false);
    expect(userLoginTokenSchema.safeParse("Z".repeat(64)).success).toBe(false);
  });
});
