import { z } from "zod";
import type { UserAccess } from "./roles";
import { pinSchema } from "./pin";

export const QUICK_LOGIN_PATH = "/api/quick-login";
export const quickLoginTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const quickLoginInputSchema = z.object({ userId: z.number().int().positive(), pin: pinSchema });

export type QuickLoginLink = { companyName: string; url: string | null };
export type QuickLoginDirectory = {
  companyName: string;
  users: { id: number; name: string; position: string | null; hasPin: boolean }[];
};

/** Администратор и руководители с правами на задачи, людей или проверку. */
export function canManageQuickLogin(access: Pick<UserAccess, "isAdmin" | "manageTasks" | "manageUsers" | "verifyTasks">): boolean {
  return access.isAdmin || access.manageTasks || access.manageUsers || access.verifyTasks;
}
