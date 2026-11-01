// QR-приглашения сотрудников.
// Часть маршрутов из server/routes.ts: порядок регистрации задаёт registerRoutes.
import type { Express } from "express";
import crypto from "node:crypto";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { normalizePhone } from "../phone-normalize";
import { api } from "@shared/routes";
import { z } from "zod";
import { hashPin, nowSec } from "../pin-auth";
import { seatProblem } from "../plan-limits";
import { requireAuth, requireAdmin, resolveRoleGrant, getCompanyIdFromReq } from "./common";

export function registerInvitationRoutes(app: Express): void {
  // ============================================================
  // Invitations: QR-приглашения сотрудников
  // ============================================================
  // Админ нажимает «Сгенерировать QR» → создаётся invitations row,
  // отдаётся ссылка вида /join/<token>. Сотрудник открывает её,
  // вводит имя+телефон, попадает в кабинет. Подробности — spec
  // docs/superpowers/specs/2026-04-28-invitations-qr-design.md.

  app.post(api.invitations.create.path, requireAuth, requireAdmin, async (req, res) => {
    try {
      const input = api.invitations.create.input.parse(req.body);
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId) {
        return res.status(400).json({ message: "Company не определена" });
      }
      const adminId = req.session.userId;
      if (!adminId) {
        return res.status(401).json({ message: "Нет сессии" });
      }

      const isAdmin = input.role === "admin" || input.role === "manager";
      const grant = isAdmin ? { role: null } : await resolveRoleGrant(companyId, input.roleId);
      if ("error" in grant) {
        return res.status(400).json({ message: grant.error, field: "roleId" });
      }
      const token = crypto.randomBytes(32).toString("base64url");

      const inv = await storage.createInvitation({
        token,
        companyId,
        createdByUserId: adminId,
        position: input.position ?? null,
        isAdmin,
        roleId: grant.role?.id ?? null,
      });

      const baseUrl = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") ||
        `${req.protocol}://${req.get("host")}`;
      const url = `${baseUrl}/join/${inv.token}`;

      res.status(201).json({
        id: inv.id,
        token: inv.token,
        url,
        position: inv.position,
        isAdmin: inv.isAdmin,
        createdAt: inv.createdAt,
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Error creating invitation:", err);
      res.status(500).json({ message: "Ошибка создания приглашения" });
    }
  });

  app.get(api.invitations.list.path, requireAuth, requireAdmin, async (req, res) => {
    try {
      const companyId = await getCompanyIdFromReq(req);
      if (!companyId) return res.json([]);
      const includeAll = req.query.includeAll === "true";
      const list = await storage.getInvitationsByCompany(companyId, includeAll);
      res.json(list);
    } catch (err: any) {
      console.error("Error listing invitations:", err);
      res.status(500).json({ message: "Ошибка загрузки приглашений" });
    }
  });

  app.post("/api/invitations/:id/revoke", requireAuth, requireAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ message: "Некорректный id" });
      }
      const adminCompanyId = await getCompanyIdFromReq(req);
      const inv = await storage.getInvitationById(id);
      // 404 — и для чужой компании, и для несуществующего id (не подтверждаем существование).
      if (!inv || inv.companyId !== adminCompanyId) {
        return res.status(404).json({ message: "Приглашение не найдено" });
      }
      if (inv.usedAt || inv.revokedAt) {
        return res.status(400).json({ message: "Приглашение уже неактивно" });
      }
      const updated = await storage.revokeInvitation(id);
      res.json(updated);
    } catch (err: any) {
      console.error("Error revoking invitation:", err);
      res.status(500).json({ message: "Ошибка отзыва приглашения" });
    }
  });

  // Публичные ручки приглашений: 30 запросов/минуту с IP. Защита от
  // перебора токенов чисто символическая — энтропия 256 бит и так
  // делает перебор нереальным, но это бесплатно. Применяется ко всему
  // /api/invitations/by-token/* (preview + accept).
  const inviteAcceptLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: "Слишком много запросов, попробуйте через минуту" },
  });
  app.use("/api/invitations/by-token", inviteAcceptLimiter);

  // Публичная: превью приглашения по токену.
  // Намеренно не отдаём id/companyId/createdByUserId/isAdmin —
  // только то, что нужно показать сотруднику на форме регистрации.
  app.get("/api/invitations/by-token/:token", async (req, res) => {
    try {
      const inv = await storage.getInvitationByToken(req.params.token);
      if (!inv) return res.json({ valid: false, reason: "not_found" });
      if (inv.revokedAt) return res.json({ valid: false, reason: "revoked" });
      if (inv.usedAt) return res.json({ valid: false, reason: "used" });
      const company = await storage.getCompanyById(inv.companyId);
      if (!company) return res.json({ valid: false, reason: "not_found" });
      res.json({
        valid: true,
        companyName: company.name,
        position: inv.position,
      });
    } catch (err: any) {
      console.error("Error reading invitation:", err);
      res.status(500).json({ message: "Ошибка чтения приглашения" });
    }
  });

  // Публичная: принять приглашение, создать User, авто-логин.
  // Race-protected: атомарный markInvitationUsed; если не успели —
  // откатываем созданного юзера и определяем причину повторным чтением.
  app.post("/api/invitations/by-token/:token/accept", async (req, res) => {
    try {
      const input = api.invitations.accept.input.parse(req.body);

      const inv = await storage.getInvitationByToken(req.params.token);
      if (!inv) {
        return res.status(400).json({ reason: "not_found", message: "Ссылка не найдена" });
      }
      if (inv.revokedAt) {
        return res.status(400).json({ reason: "revoked", message: "Приглашение отозвано" });
      }
      if (inv.usedAt) {
        return res.status(400).json({ reason: "used", message: "Приглашение уже использовано" });
      }

      const normalizedPhone = normalizePhone(input.phone);
      const existing = await storage.getUserByPhone(normalizedPhone);
      if (existing) {
        // НЕ помечаем приглашение как used — пусть человек попробует
        // другой телефон по той же ссылке.
        return res.status(400).json({
          message: "Пользователь с таким номером уже существует",
          field: "phone",
        });
      }

      const noSeat = await seatProblem(inv.companyId);
      if (noSeat) return res.status(402).json({ message: noSeat, code: "plan_limit" });

      // Роль из приглашения — если её ещё не удалили.
      const inviteRole = inv.isAdmin ? { role: null } : await resolveRoleGrant(inv.companyId, inv.roleId);
      const user = await storage.createUser({
        phone: normalizedPhone,
        name: input.name,
        isAdmin: inv.isAdmin,
        companyId: inv.companyId,
        position: inv.position,
        ...("role" in inviteRole && inviteRole.role ? { roleId: inviteRole.role.id } : {}),
        pinHash: hashPin(input.pin),
        pdConsentAt: nowSec(),
      });

      const ok = await storage.markInvitationUsed(inv.id, user.id);
      if (!ok) {
        // Race: пока создавали юзера, кто-то опередил или приглашение
        // отозвали. Откатываем юзера, определяем причину повторным чтением.
        await storage.deleteUser(user.id);
        const refreshed = await storage.getInvitationByToken(req.params.token);
        const reason = refreshed?.revokedAt ? "revoked" : "used";
        return res.status(400).json({
          reason,
          message: reason === "used"
            ? "Приглашение уже использовано"
            : "Приглашение отозвано",
        });
      }

      const company = await storage.getCompanyById(inv.companyId);
      req.session.userId = user.id;

      res.status(201).json({
        user,
        company: company
          ? { id: company.id, name: company.name }
          : { id: inv.companyId, name: "" },
      });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join("."),
        });
      }
      console.error("Error accepting invitation:", err);
      res.status(500).json({ message: "Ошибка регистрации" });
    }
  });
}
