import type { Express, Request, Response } from "express";
import { randomBytes } from "node:crypto";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { accessOf } from "../access";
import { checkPin } from "../pin-auth";
import { getPublicTasksflowBaseUrl } from "../public-urls";
import { requireAuth } from "./common";
import { canManageQuickLogin, QUICK_LOGIN_PATH, quickLoginInputSchema, quickLoginTokenSchema } from "@shared/quick-login";

export function registerQuickLoginRoutes(app: Express): void {
  app.use(QUICK_LOGIN_PATH, (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  const manage = async (req: Request, res: Response, create: boolean) => {
    try {
      const user = await storage.getUserById(req.session.userId!);
      if (!user || !canManageQuickLogin(await accessOf(user))) {
        return res.status(403).json({ message: "Печать QR-кода доступна владельцу и руководителю" });
      }
      const company = user.companyId ? await storage.getCompanyById(user.companyId) : undefined;
      if (!company) return res.status(404).json({ message: "Организация не найдена" });
      const token = create
        ? await storage.ensureCompanyLoginLink(company.id, randomBytes(32).toString("hex"))
        : await storage.getCompanyLoginLink(company.id);
      res.json({ companyName: company.name, url: token ? `${getPublicTasksflowBaseUrl(req)}/quick-login/${token}` : null });
    } catch {
      res.status(500).json({ message: "Не удалось загрузить QR-код. Повторите попытку." });
    }
  };
  app.get(`${QUICK_LOGIN_PATH}/link`, requireAuth, (req, res) => { void manage(req, res, false); });
  app.post(`${QUICK_LOGIN_PATH}/link`, requireAuth, (req, res) => { void manage(req, res, true); });

  const publicLimiter = rateLimit({
    windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false,
    message: { message: "Слишком много запросов. Повторите через минуту." },
  });
  app.use(`${QUICK_LOGIN_PATH}/by-token`, publicLimiter);

  app.get(`${QUICK_LOGIN_PATH}/by-token/:token`, async (req, res) => {
    try {
      const token = quickLoginTokenSchema.safeParse(req.params.token);
      const companyId = token.success ? await storage.getCompanyIdByLoginToken(token.data) : undefined;
      const company = companyId ? await storage.getCompanyById(companyId) : undefined;
      if (!company) return res.status(404).json({ message: "Ссылка входа недействительна. Попросите QR-код у руководителя." });
      const users = await storage.getAllUsers(company.id);
      res.json({
        companyName: company.name,
        users: users.filter((u) => !u.isRoot).map((u) => ({
          id: u.id, name: u.name?.trim() || `Сотрудник #${u.id}`, position: u.position ?? null, hasPin: !!u.pinHash,
        })).sort((a, b) => a.name.localeCompare(b.name, "ru")),
      });
    } catch {
      res.status(500).json({ message: "Не удалось загрузить сотрудников. Повторите попытку." });
    }
  });

  app.post(`${QUICK_LOGIN_PATH}/by-token/:token/login`, async (req, res) => {
    try {
      const token = quickLoginTokenSchema.safeParse(req.params.token);
      const input = quickLoginInputSchema.safeParse(req.body);
      if (!input.success) return res.status(400).json({ message: "Выберите сотрудника и введите PIN из 4 цифр" });
      const companyId = token.success ? await storage.getCompanyIdByLoginToken(token.data) : undefined;
      const company = companyId ? await storage.getCompanyById(companyId) : undefined;
      if (!company) return res.status(404).json({ message: "Ссылка входа недействительна. Попросите QR-код у руководителя." });
      const user = await storage.getUserById(input.data.userId);
      if (!user || user.companyId !== company.id || user.isRoot) {
        return res.status(401).json({ message: "Сотрудник не найден в этой организации" });
      }
      // Через публичный список нельзя захватить аккаунт, придумав ему PIN.
      if (!user.pinHash) return res.status(403).json({ message: "PIN ещё не задан. Обратитесь к руководителю." });
      const check = await checkPin(user, input.data.pin);
      if (!check.ok) {
        if (check.body.retryAfterSec) res.setHeader("Retry-After", String(check.body.retryAfterSec));
        return res.status(check.status).json(check.body);
      }
      // Регенерация сессии защищает от фиксации и стирает старый email-вход.
      req.session.regenerate((err) => {
        if (err) return res.status(500).json({ message: "Не удалось войти. Повторите попытку." });
        req.session.userId = user.id;
        req.session.save((saveError) => {
          if (saveError) return res.status(500).json({ message: "Не удалось сохранить вход. Повторите попытку." });
          res.json({ success: true });
        });
      });
    } catch {
      res.status(500).json({ message: "Не удалось войти. Повторите попытку." });
    }
  });
}
