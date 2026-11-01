// Регистрация компании и сотрудника, настройки своей компании (/api/companies/me).
// Часть маршрутов из server/routes.ts: порядок регистрации задаёт registerRoutes.
import type { Express } from "express";
import { storage } from "../storage";
import { normalizePhone } from "../phone-normalize";
import { z } from "zod";
import { isPublicHttpsUrl } from "../url-allowlist";
import { registerCompanySchema, loginSchema } from "@shared/schema";
import { hashPin, nowSec } from "../pin-auth";
import { consentSchema, newPinSchema } from "@shared/pin";
import { isValidTimeZone } from "@shared/day";
import {
  notifySettingsSchema,
  parseNotifySettings,
  QUIET_MAX_MINUTES,
  quietLength,
  quietUntil,
  withDefaults,
} from "@shared/notify";
import { forgetCompanyClock } from "../push/quiet";
import { photoSettingsSchema } from "@shared/photo-settings";
import { seatProblem } from "../plan-limits";
import {
  requireAuth,
  requireAdmin,
  requireAuthOrApiKey,
  toPublicCompany,
  getCompanyIdFromReq,
} from "./common";

export function registerCompanyMeRoutes(app: Express): void {
  // Регистрация новой компании и администратора
  app.post("/api/companies/register", async (req, res) => {
    try {
      const input = registerCompanySchema.parse(req.body);

      // Нормализуем номер телефона
      const normalizedPhone = normalizePhone(input.phone);

      // Проверяем, существует ли пользователь с таким телефоном
      const existingUser = await storage.getUserByPhone(normalizedPhone);
      if (existingUser) {
        return res.status(400).json({
          message: "Пользователь с таким номером уже существует",
          field: "phone",
        });
      }

      // Создаём компанию
      const company = await storage.createCompany({
        name: input.companyName,
        email: input.email,
      });

      // Создаём администратора компании: PIN он придумал сам при регистрации.
      const user = await storage.createUser({
        phone: normalizedPhone,
        name: input.adminName || undefined,
        isAdmin: true,
        companyId: company.id,
        pinHash: hashPin(input.pin),
        pdConsentAt: nowSec(),
      });

      // Автоматически авторизуем пользователя
      req.session.userId = user.id;

      res.status(201).json({ company, user });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error('Error registering company:', err);
      res.status(500).json({ message: 'Ошибка регистрации' });
    }
  });

  // Регистрация пользователя к существующей компании (по телефону админа)
  app.post("/api/users/register", async (req, res) => {
    try {
      const registerUserSchema = z.object({
        phone: loginSchema.shape.phone,
        name: z.string().min(1, "Введите имя"),
        adminPhone: loginSchema.shape.phone,
        pin: newPinSchema,
        consent: consentSchema,
      });

      const input = registerUserSchema.parse(req.body);

      // Нормализуем номера телефонов
      const normalizedPhone = normalizePhone(input.phone);
      const normalizedAdminPhone = normalizePhone(input.adminPhone);

      // Проверяем, существует ли пользователь с таким телефоном
      const existingUser = await storage.getUserByPhone(normalizedPhone);
      if (existingUser) {
        return res.status(400).json({
          message: "Пользователь с таким номером уже существует",
          field: "phone",
        });
      }

      // Ищем администратора по телефону. Anti-enumeration: три разных
      // ветки (не найден / не админ / без компании) объединяем в одно
      // generic-сообщение, иначе атакующий через rate-лимитированный
      // бот может построить реестр админов компаний — узнать «номер X
      // = админ компании Y». Юзеру для UX достаточно знать «телефон
      // админа неверный, спроси у него».
      const admin = await storage.getUserByPhone(normalizedAdminPhone);
      if (!admin || !admin.isAdmin || !admin.companyId) {
        return res.status(400).json({
          message:
            "Не получилось привязаться к компании. Уточните у админа правильный номер.",
          field: "adminPhone",
        });
      }

      const noSeat = await seatProblem(admin.companyId);
      if (noSeat) return res.status(402).json({ message: noSeat, code: "plan_limit" });

      // Создаём пользователя в компании админа
      const user = await storage.createUser({
        phone: normalizedPhone,
        name: input.name,
        isAdmin: false,
        companyId: admin.companyId,
        pinHash: hashPin(input.pin),
        pdConsentAt: nowSec(),
      });

      // Автоматически авторизуем пользователя
      req.session.userId = user.id;

      res.status(201).json(user);
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error('Error registering user:', err);
      res.status(500).json({ message: 'Ошибка регистрации' });
    }
  });

  // Получить компанию текущего пользователя
  app.get("/api/companies/me", requireAuthOrApiKey, async (req, res) => {
    try {
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId) {
        return res.json(null);
      }
      const company = await storage.getCompanyById(companyId);
      if (!company) return res.json(null);
      // Ключ интеграции WeSetup видит только админ (он его и вводит в
      // настройках). Раньше его получал любой сотрудник компании.
      const viewer = req.apiKey ? null : await storage.getUserById(req.session.userId!);
      res.json(toPublicCompany(company, !viewer || viewer.isAdmin));
    } catch (err: any) {
      console.error('Error fetching company:', err);
      res.status(500).json({ message: 'Ошибка' });
    }
  });

  // Обновить компанию (только админ)
  app.put("/api/companies/me", requireAuth, requireAdmin, async (req, res) => {
    try {
      const user = await storage.getUserById(req.session.userId!);
      if (!user || !user.companyId) {
        return res.status(400).json({ message: 'Компания не найдена' });
      }

      const updateCompanySchema = z.object({
        name: z.string().trim().min(1, "Название компании обязательно"),
        // Не передан — не трогаем (раньше частичное сохранение стирало email).
        email: z
          .string()
          .trim()
          .optional()
          .nullable()
          .transform((value) => (value === undefined ? undefined : value ? value : null))
          .refine(
            // Email: либо null/undefined, либо валидный формат.
            // Раньше принимали любой мусор → ломались уведомления о
            // выполненных задачах.
            (value) =>
              value === null ||
              value === undefined ||
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
            "Введите корректный email"
          ),
        wesetupBaseUrl: z
          .string()
          .trim()
          .optional()
          .nullable()
          .transform((value) =>
            value === undefined ? undefined : value ? value.replace(/\/+$/, "") : null
          )
          .refine(
            // Защита от SSRF: только публичные http(s) URL'ы. Раньше
            // /^https?:\/\// разрешал http://localhost:6379 и
            // http://169.254.169.254 → SSRF-канал из админки.
            (value) =>
              value === null || value === undefined || isPublicHttpsUrl(value),
            "URL WeSetup должен быть публичным http(s) — internal/localhost адреса запрещены"
          ),
        wesetupApiKey: z
          .string()
          .trim()
          .optional()
          .nullable()
          .transform((value) =>
            value === undefined ? undefined : value ? value : null
          ),
        // Пояс компании: по нему полночный сброс задач и дни в отчётах.
        timezone: z
          .string()
          .optional()
          .refine((value) => value === undefined || isValidTimeZone(value), "Неизвестный часовой пояс"),
        // Напоминания в Telegram: время «ЧЧ:ММ» или null — выключено.
        notify: notifySettingsSchema.optional(),
        // Фото-отчёты: время на фото и «только камера».
        photo: photoSettingsSchema.optional(),
      });

      const parsed = updateCompanySchema.safeParse(req.body);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return res.status(400).json({
          message: issue?.message || "Некорректные данные компании",
          field: issue?.path.join("."),
        });
      }

      const { name, email, wesetupBaseUrl, wesetupApiKey, timezone, notify, photo } = parsed.data;
      const updateData: {
        name: string;
        email?: string | null;
        wesetupBaseUrl?: string | null;
        wesetupApiKey?: string | null;
        timezone?: string;
        notifySettings?: string;
        photoSettings?: string;
      } = { name };
      if (email !== undefined) updateData.email = email;
      if (wesetupBaseUrl !== undefined) updateData.wesetupBaseUrl = wesetupBaseUrl;
      if (wesetupApiKey !== undefined) updateData.wesetupApiKey = wesetupApiKey;
      if (timezone !== undefined) updateData.timezone = timezone;
      if (notify !== undefined) {
        // Дни и «ночь» старый кабинет не присылает — оставляем сохранённые.
        const saved = parseNotifySettings((await storage.getCompanyById(user.companyId))?.notifySettings);
        const merged = withDefaults({ ...saved, ...notify });
        if (merged.quietFrom && quietLength(merged.quietFrom, quietUntil(merged)) > QUIET_MAX_MINUTES) {
          return res.status(400).json({
            message: "Ночь получается длиннее 14 часов — проверьте время «не беспокоить с»",
            field: "notify.quietFrom",
          });
        }
        updateData.notifySettings = JSON.stringify(merged);
      }
      if (photo !== undefined) updateData.photoSettings = JSON.stringify(photo);

      const company = await storage.updateCompany(user.companyId, updateData);
      // Новая «ночь» действует сразу, а не через минуту кэша.
      if (notify !== undefined || timezone !== undefined) forgetCompanyClock(user.companyId);

      res.json(company ? toPublicCompany(company, true) : null);
    } catch (err: any) {
      console.error('Error updating company:', err);
      res.status(500).json({ message: 'Ошибка обновления компании' });
    }
  });
}
