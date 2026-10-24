import type { Express, Request, RequestHandler } from "express";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { PLAN_IDS } from "@shared/plans";
import { OFFER_REVISION } from "@shared/billing";
import { companies, locations, users } from "@shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import { companyPlan, locationsProblem, planLimitsEnforced } from "./plan-limits";
import { billingStore } from "./billing/store";

/**
 * Точки компании, привязка сотрудника к точке и root-раздел «Компании»
 * (тарифы клиентов). Обычно тариф оплачивают картой (server/billing-routes.ts),
 * здесь root ставит его вручную — например, после оплаты по счёту.
 */
type Deps = {
  requireAuthOrApiKey: RequestHandler;
  requireAuth: RequestHandler;
  requireAdmin: RequestHandler;
  requireRoot: RequestHandler;
  getCompanyIdFromReq: (req: Request) => Promise<number | null>;
};

const nowSec = () => Math.floor(Date.now() / 1000);

function affected(result: unknown): number {
  const header = Array.isArray(result) ? result[0] : result;
  return header && typeof header === "object" && "affectedRows" in header
    ? Number((header as { affectedRows: number }).affectedRows)
    : 0;
}

const locationInput = z.object({
  name: z.string().trim().min(1, "Введите название точки").max(120, "Название — до 120 символов"),
  address: z
    .string()
    .trim()
    .max(255, "Адрес — до 255 символов")
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

function zodError(err: z.ZodError) {
  const issue = err.errors[0];
  return { message: issue?.message ?? "Проверьте данные", field: issue?.path.join(".") || undefined };
}

export function registerCompanyRoutes(app: Express, deps: Deps): void {
  const companyOr404 = async (req: Request) => {
    const companyId = await deps.getCompanyIdFromReq(req);
    return companyId ?? null;
  };

  // --- Точки ---------------------------------------------------------------

  app.get("/api/locations", deps.requireAuthOrApiKey, async (req, res) => {
    try {
      const companyId = await companyOr404(req);
      if (!companyId) return res.json([]);
      const includeArchived = req.query.archived === "1";
      const rows = await db
        .select()
        .from(locations)
        .where(and(eq(locations.companyId, companyId), includeArchived ? undefined : isNull(locations.archivedAt)))
        .orderBy(asc(locations.name));
      res.json(rows);
    } catch (err) {
      console.error("[locations] list", err);
      res.status(500).json({ message: "Не удалось загрузить точки" });
    }
  });

  app.post("/api/locations", deps.requireAuth, deps.requireAdmin, async (req, res) => {
    try {
      const companyId = await companyOr404(req);
      if (!companyId) return res.status(404).json({ message: "Компания не найдена" });
      const blocked = locationsProblem(await storage.getCompanyById(companyId));
      if (blocked) return res.status(402).json({ message: blocked, code: "plan_limit" });
      const input = locationInput.parse(req.body);
      const result = await db.insert(locations).values({ companyId, name: input.name, address: input.address, createdAt: nowSec() });
      const header = Array.isArray(result) ? result[0] : result;
      const id = Number((header as { insertId?: number }).insertId);
      const [row] = await db.select().from(locations).where(eq(locations.id, id));
      res.status(201).json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(zodError(err));
      console.error("[locations] create", err);
      res.status(500).json({ message: "Не удалось добавить точку" });
    }
  });

  app.put("/api/locations/:id", deps.requireAuth, deps.requireAdmin, async (req, res) => {
    try {
      const companyId = await companyOr404(req);
      const id = Number(req.params.id);
      if (!companyId || !Number.isInteger(id)) return res.status(404).json({ message: "Точка не найдена" });
      const input = locationInput.parse(req.body);
      const result = await db
        .update(locations)
        .set({ name: input.name, address: input.address })
        .where(and(eq(locations.id, id), eq(locations.companyId, companyId)));
      if (affected(result) === 0) return res.status(404).json({ message: "Точка не найдена" });
      const [row] = await db.select().from(locations).where(eq(locations.id, id));
      res.json(row);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(zodError(err));
      console.error("[locations] update", err);
      res.status(500).json({ message: "Не удалось сохранить точку" });
    }
  });

  // Удаление — в архив: история и отчёты прошлых дней не ломаются,
  // сотрудники точки становятся «без точки».
  app.delete("/api/locations/:id", deps.requireAuth, deps.requireAdmin, async (req, res) => {
    try {
      const companyId = await companyOr404(req);
      const id = Number(req.params.id);
      if (!companyId || !Number.isInteger(id)) return res.status(404).json({ message: "Точка не найдена" });
      const result = await db
        .update(locations)
        .set({ archivedAt: nowSec() })
        .where(and(eq(locations.id, id), eq(locations.companyId, companyId), isNull(locations.archivedAt)));
      if (affected(result) === 0) return res.status(404).json({ message: "Точка не найдена" });
      await db.update(users).set({ locationId: null }).where(and(eq(users.locationId, id), eq(users.companyId, companyId)));
      res.json({ ok: true });
    } catch (err) {
      console.error("[locations] archive", err);
      res.status(500).json({ message: "Не удалось удалить точку" });
    }
  });

  app.put("/api/users/:id/location", deps.requireAuth, deps.requireAdmin, async (req, res) => {
    try {
      const companyId = await companyOr404(req);
      const userId = Number(req.params.id);
      const { locationId } = z.object({ locationId: z.number().int().positive().nullable() }).parse(req.body);
      const target = Number.isInteger(userId) ? await storage.getUserById(userId) : undefined;
      if (!companyId || !target || target.companyId !== companyId) {
        return res.status(404).json({ message: "Пользователь не найден" });
      }
      if (locationId !== null) {
        const [loc] = await db
          .select()
          .from(locations)
          .where(and(eq(locations.id, locationId), eq(locations.companyId, companyId), isNull(locations.archivedAt)));
        if (!loc) return res.status(400).json({ message: "Такой точки нет", field: "locationId" });
      }
      await db.update(users).set({ locationId }).where(eq(users.id, userId));
      res.json((await storage.getUserById(userId)) ?? target);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(zodError(err));
      console.error("[locations] assign", err);
      res.status(500).json({ message: "Не удалось сохранить точку сотрудника" });
    }
  });

  // --- Root: компании и тарифы -------------------------------------------

  app.get("/api/root/companies", deps.requireRoot, async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT c.id, c.name, c.email, c.created_at AS createdAt, c.plan, c.plan_until AS planUntil,
          (SELECT COUNT(*) FROM users u WHERE u.company_id = c.id) AS usersCount,
          (SELECT COUNT(*) FROM tasks t WHERE t.company_id = c.id) AS tasksCount,
          (SELECT MAX(t.completed_at) FROM tasks t WHERE t.company_id = c.id) AS lastCompletedAt
        FROM companies c
        ORDER BY c.id DESC
        LIMIT 1000
      `);
      const rows = (Array.isArray(result) ? result[0] : result) as unknown as Array<Record<string, unknown>>;
      res.json({
        enforced: planLimitsEnforced(),
        companies: rows.map((r) => {
          const plan = companyPlan({ plan: (r.plan as string) ?? null, planUntil: (r.planUntil as number) ?? null });
          return {
            id: Number(r.id),
            name: String(r.name),
            email: (r.email as string) ?? null,
            createdAt: Number(r.createdAt ?? 0),
            plan: (r.plan as string) ?? null,
            planUntil: r.planUntil == null ? null : Number(r.planUntil),
            effectivePlan: plan.id,
            usersCount: Number(r.usersCount ?? 0),
            tasksCount: Number(r.tasksCount ?? 0),
            lastCompletedAt: r.lastCompletedAt == null ? null : Number(r.lastCompletedAt),
          };
        }),
      });
    } catch (err) {
      console.error("[root] companies", err);
      res.status(500).json({ message: "Не удалось загрузить компании" });
    }
  });

  app.put("/api/root/companies/:id/plan", deps.requireRoot, async (req, res) => {
    try {
      const id = Number(req.params.id);
      const input = z
        .object({
          plan: z.enum(PLAN_IDS as unknown as [string, ...string[]]),
          until: z.number().int().positive().nullable(),
        })
        .parse(req.body);
      const result = await db
        .update(companies)
        .set({ plan: input.plan === "start" ? null : input.plan, planUntil: input.plan === "start" ? null : input.until })
        .where(eq(companies.id, id));
      if (affected(result) === 0) return res.status(404).json({ message: "Компания не найдена" });
      // Ручная правка тарифа выключает автопродление: иначе списание по
      // сохранённой карте вернуло бы прежний тариф поверх выставленного
      // или прошло бы раньше нового срока. Отказ — в историю согласий.
      try {
        if (await billingStore.disableRecurring(id, nowSec())) {
          await billingStore.addConsent({
            companyId: id,
            userId: req.session.userId ?? null,
            orderId: null,
            granted: false,
            statementText: "Автопродление выключено: тариф изменён вручную администратором сервиса",
            offerRevision: OFFER_REVISION,
            ip: req.ip ?? null,
            userAgent: String(req.headers["user-agent"] || "") || null,
            createdAt: nowSec(),
          });
        }
      } catch (err) {
        console.error("[root] автопродление", err);
      }
      res.json({ ok: true });
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json(zodError(err));
      console.error("[root] plan", err);
      res.status(500).json({ message: "Не удалось сменить тариф" });
    }
  });
}
