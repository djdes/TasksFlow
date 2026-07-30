/**
 * Общий слой для сервисов задач: кто действует и как сервис сообщает об отказе.
 *
 * Появился, потому что бизнес-логика создания/закрытия задачи жила внутри
 * анонимных express-хендлеров и была недоступна ниоткуда, кроме HTTP.
 * Telegram-боту нужен ровно тот же код (премии, верификация, аудит,
 * WeSetup-зеркалирование), а не его вторая копия.
 *
 * Actor — это «кто», без привязки к транспорту. HTTP-роут собирает его из
 * req, бот — из привязанного telegram_user_id.
 */

import { storage, DatabaseStorage } from "../storage";

export type TaskActor =
  /** Машинная интеграция по API key: админские права в рамках своей компании. */
  | { kind: "apiKey"; companyId: number }
  /** Обычный пользователь сайта. */
  | { kind: "session"; userId: number }
  /** Привязанный пользователь Telegram-бота. Права те же, что у session. */
  | { kind: "telegram"; userId: number };

/** userId актора, если он человек. У apiKey человека нет. */
export function actorUserId(actor: TaskActor): number | null {
  return actor.kind === "apiKey" ? null : actor.userId;
}

/**
 * Отказ бизнес-логики с готовым HTTP-статусом и текстом.
 *
 * Статус живёт в сервисе, а не в роуте, потому что коды тут не косметика:
 * «чужая компания» обязана быть 404, а не 403 — иначе через разницу
 * статусов утекает факт существования задач других компаний.
 */
export class TaskServiceError extends Error {
  readonly status: number;
  readonly field?: string;

  constructor(status: number, message: string, field?: string) {
    super(message);
    this.name = "TaskServiceError";
    this.status = status;
    if (field) this.field = field;
  }
}

/** Хелпер для роутов: отдать ответ из TaskServiceError, остальное пробросить. */
export function isTaskServiceError(err: unknown): err is TaskServiceError {
  return err instanceof TaskServiceError;
}

/** companyId актора: у API key — свой, у человека — из его профиля. */
export async function resolveActorCompanyId(
  actor: TaskActor,
): Promise<number | null> {
  if (actor.kind === "apiKey") return actor.companyId;
  const user = await storage.getUserById(actor.userId);
  return user?.companyId ?? null;
}

/**
 * Проверка: может ли user назначать задачи указанному workerId.
 *   • admin — всегда да
 *   • manager (managedWorkerIds set) — только если worker в scope
 *     или это он сам
 *   • обычный воркер — только себе
 */
export function canAssignToWorker(
  user: { id: number; isAdmin: boolean; managedWorkerIds: string | null },
  targetWorkerId: number | null | undefined,
): boolean {
  if (user.isAdmin) return true;
  if (!targetWorkerId) return false; // нельзя оставить «без исполнителя» если ты не админ
  if (targetWorkerId === user.id) return true;
  const m2 = DatabaseStorage.parseManagedWorkerIds(user.managedWorkerIds);
  if (!Array.isArray(m2)) return false;
  return m2.includes(targetWorkerId);
}
