import type { Express } from "express";
import type { User } from "@shared/schema";
import { broadcastInputSchema, reasonOf, type BroadcastChannel, type BroadcastReach, type BroadcastRecipient, type BroadcastResult } from "@shared/broadcast";
import { canAssignTo, type UserAccess } from "@shared/roles";
import type { PushMessage } from "@shared/push";
import { storage } from "../storage";
import { accessOf } from "../access";
import { sendToUsers, type PushOutcome } from "../push";
import { pushStore } from "../push/store";
import { getTelegramRuntime } from "../telegram";
import { escapeHtml } from "../telegram/util";
import { getPublicTasksflowBaseUrl } from "../public-urls";
import { logger } from "../logger";
import { requireAuth } from "./common";

export type BroadcastDeps = {
  push: (userId: number, message: PushMessage) => Promise<PushOutcome>;
  /** Сколько устройств подписано у каждого (для списка «Кому»). */
  devices: (userIds: number[]) => Promise<Map<number, number>>;
  telegram: ((chatId: number, html: string, url: string) => Promise<boolean>) | null;
  dashboardUrl: string;
};

const nameOf = (u: Pick<User, "id" | "name" | "phone">) => u.name || u.phone || `#${u.id}`;
const linked = (u: User) => u.tgChatId != null && u.tgStartedAt != null;

/**
 * Разослать уведомление выбранным людям: push на все устройства и Telegram.
 * Кому не дошло ни одним способом — в unreachable, чтобы руководитель знал,
 * кого предупредить лично (или помочь включить уведомления).
 */
export async function broadcast(sender: Pick<User, "id" | "name" | "phone">, targets: User[], text: string, deps: BroadcastDeps): Promise<BroadcastResult> {
  const from = nameOf(sender);
  const message: PushMessage = { title: from, body: text, url: "/dashboard", tag: `broadcast-${Date.now()}`, ttl: 24 * 3600 };
  const html = `📣 <b>${escapeHtml(from)}</b>\n${escapeHtml(text)}`;
  const delivered: BroadcastRecipient[] = [];
  const unreachable: BroadcastRecipient[] = [];
  // Не больше 8 человек одновременно — как и в рассылке push.
  for (let i = 0; i < targets.length; i += 8) {
    await Promise.all(
      targets.slice(i, i + 8).map(async (u) => {
        const channels: BroadcastChannel[] = [];
        // Отправка упала целиком — считаем «сервис не принял», а не «нет телефона».
        const none = { devices: 1, sent: 0, removed: 0, failed: 1, skipped: 0 };
        const outcome = await deps.push(u.id, message).catch(() => none);
        if (outcome.sent > 0) channels.push("push");
        if (deps.telegram && linked(u) && (await deps.telegram(Number(u.tgChatId), html, deps.dashboardUrl).catch(() => false))) channels.push("telegram");
        if (channels.length) delivered.push({ id: u.id, name: nameOf(u), channels });
        else unreachable.push({ id: u.id, name: nameOf(u), channels, reason: reasonOf(outcome), telegram: linked(u) });
      }),
    );
  }
  const byName = (a: BroadcastRecipient, b: BroadcastRecipient) => a.name.localeCompare(b.name, "ru");
  return { delivered: delivered.sort(byName), unreachable: unreachable.sort(byName) };
}

function defaultDeps(): BroadcastDeps {
  const runtime = getTelegramRuntime();
  return {
    push: (userId, message) => sendToUsers([userId], message),
    devices: async (userIds) => {
      const map = new Map<number, number>();
      for (const s of await pushStore.listForUsers(userIds)) map.set(s.userId, (map.get(s.userId) ?? 0) + 1);
      return map;
    },
    telegram: runtime
      ? async (chatId, html, url) => {
          await runtime.client.sendMessage({
            chat_id: chatId,
            parse_mode: "HTML",
            text: html,
            reply_markup: { inline_keyboard: [[{ text: "📋 Открыть задачи", url }]] },
          });
          return true;
        }
      : null,
    dashboardUrl: `${getPublicTasksflowBaseUrl()}/dashboard`,
  };
}

/** Кому можно писать: тем же, кому можно ставить задачи (себе — нет). */
export function canNotify(access: UserAccess, target: Pick<User, "id">): boolean {
  return target.id !== access.userId && canAssignTo(access, target.id);
}

// Защита от случайной пачки: не больше 20 рассылок за 10 минут от одного человека.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 20;
const recent = new Map<number, number[]>();
export function takeBroadcastSlot(userId: number, now = Date.now()): boolean {
  const list = (recent.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_PER_WINDOW) {
    recent.set(userId, list);
    return false;
  }
  list.push(now);
  recent.set(userId, list);
  return true;
}
export function resetBroadcastLimit() {
  recent.clear();
}

export function registerBroadcastRoutes(app: Express, deps: () => BroadcastDeps = defaultDeps) {
  // Как каждый из «своих» получает уведомления — до отправки, в списке «Кому».
  app.get("/api/notifications/reach", requireAuth, async (req, res) => {
    try {
      if (req.apiKey) return res.status(403).json({ message: "Недоступно по API-ключу" });
      const me = await storage.getUserById(req.session.userId!);
      if (!me?.companyId) return res.status(403).json({ message: "Нет доступа" });
      const access = await accessOf(me);
      if (!access.isAdmin && !access.manageTasks) return res.status(403).json({ message: "Нет доступа" });
      const targets = (await storage.getAllUsers(me.companyId)).filter((u) => canNotify(access, u));
      const devices = await deps().devices(targets.map((u) => u.id));
      const reach: BroadcastReach[] = targets.map((u) => ({ id: u.id, devices: devices.get(u.id) ?? 0, telegram: linked(u) }));
      res.json(reach);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "[broadcast] reach");
      res.status(500).json({ message: "Не удалось узнать, у кого включены уведомления" });
    }
  });

  app.post("/api/notifications/send", requireAuth, async (req, res) => {
    try {
      // Только из кабинета: по API-ключу рассылки закрыты, как push и Telegram.
      if (req.apiKey) return res.status(403).json({ message: "Рассылка по API-ключу недоступна" });
      const me = await storage.getUserById(req.session.userId!);
      if (!me?.companyId) return res.status(403).json({ message: "Нет доступа" });
      const access = await accessOf(me);
      if (!access.isAdmin && !access.manageTasks) return res.status(403).json({ message: "Уведомления отправляют администратор и руководитель" });

      const parsed = broadcastInputSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.errors[0]?.message ?? "Проверьте данные" });
      const { userIds, text } = parsed.data;

      const people = await storage.getAllUsers(me.companyId);
      const wanted = new Set(userIds);
      const targets = people.filter((u) => wanted.has(u.id) && u.companyId === me.companyId);
      if (targets.length !== wanted.size || targets.some((u) => !canNotify(access, u))) {
        return res.status(403).json({ message: "Можно писать только своим сотрудникам" });
      }
      if (!takeBroadcastSlot(me.id)) {
        return res.status(429).json({ message: "Слишком много рассылок подряд — подождите несколько минут" });
      }

      const result = await broadcast(me, targets, text, deps());
      logger.info(
        {
          from: me.id,
          company: me.companyId,
          to: targets.length,
          delivered: result.delivered.length,
          unreachable: result.unreachable.map((u) => `${u.id}:${u.reason}`).join(","),
        },
        "[broadcast] уведомление разослано",
      );
      res.json(result);
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : String(err) }, "[broadcast] ошибка");
      res.status(500).json({ message: "Не удалось отправить уведомление" });
    }
  });
}
