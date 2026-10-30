import type { Express, Request, RequestHandler } from "express";
import { z } from "zod";
import {
  accessSettingsSchema,
  parseAccessSettings,
  roleInputSchema,
  type RolesResponse,
} from "@shared/roles";
import { storage } from "./storage";

/**
 * Роли компании (shared/roles.ts):
 *
 *   GET    /api/roles           — свои роли и настройка «Сотрудника»; админу
 *                                 и тому, кто добавляет сотрудников (ему нужен
 *                                 список ролей в форме);
 *   POST   /api/roles           — новая роль (админ);
 *   PUT    /api/roles/:id       — название и права (админ);
 *   DELETE /api/roles/:id       — удалить; её люди становятся «Сотрудниками»;
 *   PUT    /api/roles/settings  — «выполненное сотрудником — на проверку».
 *
 * Чужая компания — 404, как везде: не подтверждаем, что роль существует.
 */
type Deps = {
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
  requireUserManager: RequestHandler;
  getCompanyIdFromReq: (req: Request) => Promise<number | null>;
};

/** Больше ролей компании не нужно — защита от мусора, а не тарифный лимит. */
export const MAX_ROLES = 30;

function zodError(err: z.ZodError) {
  const issue = err.errors[0];
  return { message: issue?.message ?? "Проверьте данные", field: issue?.path.join(".") || undefined };
}

const sameName = (a: string, b: string) => a.trim().toLowerCase().replace(/ё/g, "е") === b.trim().toLowerCase().replace(/ё/g, "е");

export function registerRoleRoutes(app: Express, deps: Deps): void {
  async function payload(companyId: number): Promise<RolesResponse> {
    const [roles, company] = await Promise.all([storage.listCompanyRoles(companyId), storage.getCompanyById(companyId)]);
    return { roles, employeeApproval: parseAccessSettings(company?.accessSettings).employeeApproval };
  }

  app.get("/api/roles", deps.requireAuth, deps.requireUserManager, async (req, res) => {
    try {
      const companyId = await deps.getCompanyIdFromReq(req);
      if (!companyId) return res.status(404).json({ message: "Компания не найдена" });
      res.json(await payload(companyId));
    } catch (err) {
      console.error("[roles] list", err);
      res.status(500).json({ message: "Не удалось загрузить роли" });
    }
  });

  // Зарегистрирован до /api/roles/:id: иначе "settings" станет id.
  app.put("/api/roles/settings", deps.requireAuth, deps.requireAdmin, async (req, res) => {
    try {
      const companyId = await deps.getCompanyIdFromReq(req);
      if (!companyId) return res.status(404).json({ message: "Компания не найдена" });
      const settings = accessSettingsSchema.parse(req.body);
      await storage.updateCompany(companyId, { accessSettings: JSON.stringify(settings) });
      res.json(await payload(companyId));
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(zodError(err));
      console.error("[roles] settings", err);
      res.status(500).json({ message: "Не удалось сохранить настройку" });
    }
  });

  app.post("/api/roles", deps.requireAuth, deps.requireAdmin, async (req, res) => {
    try {
      const companyId = await deps.getCompanyIdFromReq(req);
      if (!companyId) return res.status(404).json({ message: "Компания не найдена" });
      const input = roleInputSchema.parse(req.body);
      const existing = await storage.listCompanyRoles(companyId);
      if (existing.length >= MAX_ROLES) {
        return res.status(400).json({ message: `Ролей не больше ${MAX_ROLES}` });
      }
      if (existing.some((r) => sameName(r.name, input.name))) {
        return res.status(400).json({ message: "Роль с таким названием уже есть", field: "name" });
      }
      const role = await storage.createCompanyRole(companyId, input);
      res.status(201).json(role);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(zodError(err));
      console.error("[roles] create", err);
      res.status(500).json({ message: "Не удалось создать роль" });
    }
  });

  async function ownRole(req: Request) {
    const companyId = await deps.getCompanyIdFromReq(req);
    const id = Number(req.params.id);
    if (!companyId || !Number.isInteger(id) || id <= 0) return null;
    const role = await storage.getCompanyRole(id);
    return role && role.companyId === companyId ? role : null;
  }

  app.put("/api/roles/:id", deps.requireAuth, deps.requireAdmin, async (req, res) => {
    try {
      const role = await ownRole(req);
      if (!role) return res.status(404).json({ message: "Роль не найдена" });
      const input = roleInputSchema.parse(req.body);
      const others = (await storage.listCompanyRoles(role.companyId)).filter((r) => r.id !== role.id);
      if (others.some((r) => sameName(r.name, input.name))) {
        return res.status(400).json({ message: "Роль с таким названием уже есть", field: "name" });
      }
      res.json((await storage.updateCompanyRole(role.id, input)) ?? role);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(zodError(err));
      console.error("[roles] update", err);
      res.status(500).json({ message: "Не удалось сохранить роль" });
    }
  });

  app.delete("/api/roles/:id", deps.requireAuth, deps.requireAdmin, async (req, res) => {
    try {
      const role = await ownRole(req);
      if (!role) return res.status(404).json({ message: "Роль не найдена" });
      await storage.deleteCompanyRole(role.id);
      res.json({ ok: true });
    } catch (err) {
      console.error("[roles] delete", err);
      res.status(500).json({ message: "Не удалось удалить роль" });
    }
  });
}
