/**
 * @fileoverview Data Access Layer для работы с MySQL через Drizzle ORM
 *
 * Все методы работают с тремя таблицами: users, tasks, workers
 *
 * ВАЖНО: weekDays и photoUrls хранятся в БД как JSON строки,
 * но возвращаются как массивы (парсинг при чтении, сериализация при записи)
 */

import {
  workers,
  tasks,
  users,
  companies,
  apiKeys,
  webhookDeliveries,
  invitations,
  type Worker,
  type InsertWorker,
  type Task,
  type InsertTask,
  type User,
  type InsertUser,
  type UpdateUser,
  type Company,
  type InsertCompany,
  type ApiKey,
  type InsertApiKey,
  type WebhookDelivery,
  type InsertWebhookDelivery,
  type Invitation,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, lte, asc, isNull, sql } from "drizzle-orm";
import { normalizePhone } from "./phone-normalize";

type UpdateCompanyData = Omit<Partial<InsertCompany>, "email"> & {
  email?: string | null;
  wesetupBaseUrl?: string | null;
  wesetupApiKey?: string | null;
};

/** Интерфейс хранилища данных */
export interface IStorage {
  // Companies
  createCompany(company: InsertCompany): Promise<Company>;
  getCompanyById(id: number): Promise<Company | undefined>;
  updateCompany(id: number, company: UpdateCompanyData): Promise<Company | undefined>;

  // Users
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(user: InsertUser & { companyId?: number }): Promise<User>;
  getUserById(id: number): Promise<User | undefined>;
  getAllUsers(companyId?: number): Promise<User[]>;
  updateUser(id: number, user: UpdateUser): Promise<User | undefined>;
  setUserAdmin(id: number, isAdmin: boolean): Promise<User | undefined>;
  setUserPosition(id: number, position: string | null): Promise<User | undefined>;
  updateUserBalance(id: number, amount: number): Promise<User | undefined>;
  resetUserBalance(id: number): Promise<User | undefined>;
  setManagedWorkers(userId: number, workerIds: number[]): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;

  // Workers
  getWorkers(companyId?: number): Promise<Worker[]>;
  getWorker(id: number): Promise<Worker | undefined>;
  createWorker(worker: InsertWorker & { companyId?: number }): Promise<Worker>;
  updateWorker(id: number, worker: InsertWorker): Promise<Worker | undefined>;
  deleteWorker(id: number): Promise<void>;

  // Tasks
  getTasks(companyId?: number): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask & { companyId?: number }): Promise<Task>;
  updateTask(id: number, task: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: number): Promise<void>;
  claimSiblingTasks(args: {
    sourceTaskId: number;
    documentId: string;
    journalKind: string;
    claimedByWorkerId: number;
    companyId: number | null;
    completedAt: number;
  }): Promise<number>;
  /**
   * Атомарный переход isCompleted=false → true. Возвращает true если
   * row реально перешёл (применять баланс), false если уже completed
   * (или не существует). Race-safe: при двух параллельных вызовах
   * только один вернёт true.
   */
  transitionTaskToCompleted(id: number): Promise<boolean>;
  transitionTaskToUncompleted(id: number): Promise<boolean>;

  // API Keys
  createApiKey(data: Omit<InsertApiKey, 'id' | 'createdAt'>): Promise<ApiKey>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined>;
  getApiKeyById(id: number): Promise<ApiKey | undefined>;
  listApiKeysByCompany(companyId: number): Promise<ApiKey[]>;
  revokeApiKey(id: number): Promise<void>;
  updateApiKeyLastUsed(id: number, ts: number): Promise<void>;
  countActiveApiKeysByCompany(companyId: number): Promise<number>;

  // Invitations
  createInvitation(data: {
    token: string;
    companyId: number;
    createdByUserId: number;
    position: string | null;
    isAdmin: boolean;
  }): Promise<Invitation>;
  getInvitationById(id: number): Promise<Invitation | undefined>;
  getInvitationByToken(token: string): Promise<Invitation | undefined>;
  getInvitationsByCompany(companyId: number, includeAll: boolean): Promise<Invitation[]>;
  /** Атомарный mark-as-used. Возвращает true если успели первыми. */
  markInvitationUsed(id: number, usedByUserId: number): Promise<boolean>;
  revokeInvitation(id: number): Promise<Invitation | undefined>;
}

/** Реализация хранилища с MySQL через Drizzle ORM */
export class DatabaseStorage implements IStorage {
  // ===================== COMPANIES =====================

  /**
   * Создание новой компании
   * @param company - Данные компании (name обязателен)
   * @returns Созданная компания с id
   */
  async createCompany(company: InsertCompany): Promise<Company> {
    const [result] = await db.insert(companies).values({
      ...company,
      createdAt: Math.floor(Date.now() / 1000),
    });
    const insertId = (result as any).insertId;
    const [created] = await db.select().from(companies).where(eq(companies.id, insertId));
    if (!created) throw new Error("Failed to create company");
    return created;
  }

  /**
   * Получение компании по ID
   * @param id - ID компании
   * @returns Компания или undefined если не найдена
   */
  async getCompanyById(id: number): Promise<Company | undefined> {
    const [company] = await db.select().from(companies).where(eq(companies.id, id));
    return company || undefined;
  }

  /**
   * Обновление данных компании
   * @param id - ID компании
   * @param company - Данные для обновления
   * @returns Обновлённая компания или undefined
   */
  async updateCompany(id: number, company: UpdateCompanyData): Promise<Company | undefined> {
    await db.update(companies).set(company).where(eq(companies.id, id));
    const [updated] = await db.select().from(companies).where(eq(companies.id, id));
    return updated || undefined;
  }

  // ===================== USERS =====================

  /**
   * Поиск пользователя по номеру телефона
   * @param phone - Номер телефона (будет нормализован: убраны пробелы и дефисы)
   * @returns Пользователь или undefined если не найден
   */
  async getUserByPhone(phone: string): Promise<User | undefined> {
    const normalizedPhone = normalizePhone(phone);
    const [user] = await db.select().from(users).where(eq(users.phone, normalizedPhone));
    return user || undefined;
  }

  /**
   * Создание нового пользователя
   * @param insertUser - Данные пользователя (phone обязателен, companyId опционален)
   * @returns Созданный пользователь с id
   */
  async createUser(insertUser: InsertUser & { companyId?: number }): Promise<User> {
    // Нормализуем номер телефона
    const normalizedPhone = normalizePhone(insertUser.phone);
    const [result] = await db.insert(users).values({
      ...insertUser,
      phone: normalizedPhone,
      createdAt: Math.floor(Date.now() / 1000),
      companyId: insertUser.companyId ?? null,
    });
    const insertId = (result as any).insertId;
    const [user] = await db.select().from(users).where(eq(users.id, insertId));
    if (!user) throw new Error("Failed to create user");
    return user;
  }

  async getUserById(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getAllUsers(companyId?: number): Promise<User[]> {
    if (companyId) {
      return await db.select().from(users).where(eq(users.companyId, companyId));
    }
    return await db.select().from(users);
  }

  async updateUser(id: number, updateUser: UpdateUser): Promise<User | undefined> {
    const normalizedPhone = normalizePhone(updateUser.phone);
    const patch: Record<string, unknown> = {
      phone: normalizedPhone,
      name: updateUser.name ?? null,
    };
    if (updateUser.position !== undefined) {
      patch.position = updateUser.position ?? null;
    }
    await db.update(users).set(patch).where(eq(users.id, id));
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  /**
   * Точечное обновление должности (используется в POST /api/users
   * для existing user'ов: повторный create с position обновляет
   * её, если поменялась). Чтобы не требовать менять phone/name.
   */
  async setUserPosition(id: number, position: string | null): Promise<User | undefined> {
    await db.update(users).set({ position }).where(eq(users.id, id));
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async setUserAdmin(id: number, isAdmin: boolean): Promise<User | undefined> {
    await db.update(users).set({ isAdmin }).where(eq(users.id, id));
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  /**
   * Изменение баланса бонусов пользователя
   * @param id - ID пользователя
   * @param amount - Сумма изменения (положительная для начисления, отрицательная для списания)
   * @returns Обновлённый пользователь или undefined
   * @example
   * // Начислить 100 рублей за выполнение задачи
   * await storage.updateUserBalance(userId, 100);
   * // Списать при отмене выполнения
   * await storage.updateUserBalance(userId, -100);
   */
  async updateUserBalance(id: number, amount: number): Promise<User | undefined> {
    // Атомарный SQL-инкремент. Раньше было read-modify-write — два
    // concurrent /api/tasks/:id/complete могли потерять одно
    // начисление: оба читали balance=100, оба считали 100+50, оба
    // писали 150 (вместо 200). Worker не получал деньги за выполненную
    // задачу.
    //
    // COALESCE на null balance чтобы legacy-юзеры с NULL не сломали
    // сложение (NULL + N = NULL в SQL).
    await db
      .update(users)
      .set({
        bonusBalance: sql`COALESCE(${users.bonusBalance}, 0) + ${amount}`,
      })
      .where(eq(users.id, id));
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  /**
   * Установить список подчинённых для пользователя. Зеркалирует
   * WeSetup ManagerScope: один админ может редактировать иерархию
   * на стороне WeSetup, она пушится сюда.
   *
   * Семантика хранения:
   *   • NULL / "" → у пользователя нет подчинённых (обычный воркер)
   *   • "[]" → пустой список — означает «есть scope, но никого нет»;
   *      в /api/tasks такой пользователь видит только свои задачи
   *      (фильтр workerId in [] всегда отфильтровывает всё)
   *   • "[1,2,3]" → видит задачи воркеров 1/2/3 + свои
   */
  async setManagedWorkers(
    userId: number,
    workerIds: number[]
  ): Promise<User | undefined> {
    const cleaned = Array.from(new Set(workerIds.filter((n) => Number.isInteger(n) && n > 0)));
    await db
      .update(users)
      .set({ managedWorkerIds: JSON.stringify(cleaned) })
      .where(eq(users.id, userId));
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    return user || undefined;
  }

  /**
   * Распарсить managed_worker_ids в массив. Робастно к мусору в
   * колонке (старые записи могут быть NULL или пустой строкой).
   */
  static parseManagedWorkerIds(raw: string | null | undefined): number[] | null {
    if (raw === null || raw === undefined || raw === "") return null;
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      return parsed.filter((n) => typeof n === "number" && Number.isInteger(n));
    } catch {
      return null;
    }
  }

  /**
   * Сброс баланса до 0 — вызывается админом после ручной выплаты.
   *
   * Race-safe вариант: вместо `SET balance = 0` (overwrite) делаем
   * `SET balance = balance - prevBalance`. Если concurrent /complete
   * успел добавить N в balance между нашим SELECT и UPDATE, итоговый
   * результат будет N, а не 0 — worker не теряет только что
   * заработанные деньги.
   *
   * Раньше: read+overwrite. Сценарий потери:
   *   1. balance=5000, admin видит «выплатить 5000».
   *   2. Worker заканчивает task с price=1000 → atomic +1000 → 6000.
   *   3. Admin жмёт «Сбросить» → balance=0.
   *   4. Admin отдал 5000 наличкой, но 1000 за свежевыполненную task'у
   *      пропали — приходится отдельно компенсировать.
   *
   * Теперь: прочитанный prevBalance вычитается атомарным SQL'ом.
   * Concurrent +1000 не теряется (balance заканчивает = 1000 а не 0).
   */
  async resetUserBalance(id: number): Promise<User | undefined> {
    const [current] = await db
      .select({ bonusBalance: users.bonusBalance })
      .from(users)
      .where(eq(users.id, id));
    if (!current) return undefined;
    const prevBalance = current.bonusBalance ?? 0;
    await db
      .update(users)
      .set({
        bonusBalance: sql`COALESCE(${users.bonusBalance}, 0) - ${prevBalance}`,
      })
      .where(eq(users.id, id));
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  /** Удаление пользователя (сначала обнуляет workerId у связанных задач) */
  async deleteUser(id: number): Promise<void> {
    // Обнуляем workerId у всех задач этого пользователя
    await db.update(tasks).set({ workerId: null }).where(eq(tasks.workerId, id));
    // Удаляем пользователя
    await db.delete(users).where(eq(users.id, id));
  }

  // ===================== WORKERS =====================

  async getWorkers(companyId?: number): Promise<Worker[]> {
    if (companyId) {
      return await db.select().from(workers).where(eq(workers.companyId, companyId));
    }
    return await db.select().from(workers);
  }

  async getWorker(id: number): Promise<Worker | undefined> {
    const [worker] = await db.select().from(workers).where(eq(workers.id, id));
    return worker || undefined;
  }

  async createWorker(insertWorker: InsertWorker & { companyId?: number }): Promise<Worker> {
    const [result] = await db.insert(workers).values({
      ...insertWorker,
      companyId: insertWorker.companyId ?? null,
    });
    const insertId = (result as any).insertId;
    const [worker] = await db.select().from(workers).where(eq(workers.id, insertId));
    return worker;
  }

  async updateWorker(id: number, insertWorker: InsertWorker): Promise<Worker | undefined> {
    await db.update(workers).set(insertWorker).where(eq(workers.id, id));
    const [worker] = await db.select().from(workers).where(eq(workers.id, id));
    return worker || undefined;
  }

  async deleteWorker(id: number): Promise<void> {
    await db.delete(workers).where(eq(workers.id, id));
  }

  // ===================== TASKS =====================

  /**
   * Получение всех задач
   * @param companyId - ID компании для фильтрации (опционально)
   * @returns Массив задач с распарсенными weekDays и photoUrls
   * @note weekDays возвращается как number[] (0=Вс, 1=Пн, ..., 6=Сб)
   * @note photoUrls возвращается как string[] (пустой массив если нет фото)
   */
  async getTasks(companyId?: number): Promise<Task[]> {
    const query = db.select({
      id: tasks.id,
      title: tasks.title,
      workerId: tasks.workerId,
      requiresPhoto: tasks.requiresPhoto,
      photoUrl: tasks.photoUrl,
      photoUrls: tasks.photoUrls,
      examplePhotoUrl: tasks.examplePhotoUrl,
      isCompleted: tasks.isCompleted,
      weekDays: tasks.weekDays,
      monthDay: tasks.monthDay,
      isRecurring: tasks.isRecurring,
      price: tasks.price,
      category: tasks.category,
      description: tasks.description,
      companyId: tasks.companyId,
      journalLink: tasks.journalLink,
      createdAt: tasks.createdAt,
      completedAt: tasks.completedAt,
      claimedByWorkerId: tasks.claimedByWorkerId,
    }).from(tasks);

    const result = companyId
      ? await query.where(eq(tasks.companyId, companyId))
      : await query;

    // Парсим weekDays и photoUrls из JSON строки в массив
    return result.map(task => ({
      ...task,
      weekDays: task.weekDays ? JSON.parse(task.weekDays) : null,
      photoUrls: task.photoUrls ? JSON.parse(task.photoUrls) : [],
    })) as Task[];
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select({
      id: tasks.id,
      title: tasks.title,
      workerId: tasks.workerId,
      requiresPhoto: tasks.requiresPhoto,
      photoUrl: tasks.photoUrl,
      photoUrls: tasks.photoUrls,
      examplePhotoUrl: tasks.examplePhotoUrl,
      isCompleted: tasks.isCompleted,
      weekDays: tasks.weekDays,
      monthDay: tasks.monthDay,
      isRecurring: tasks.isRecurring,
      price: tasks.price,
      category: tasks.category,
      description: tasks.description,
      companyId: tasks.companyId,
      journalLink: tasks.journalLink,
      createdAt: tasks.createdAt,
      completedAt: tasks.completedAt,
      claimedByWorkerId: tasks.claimedByWorkerId,
    }).from(tasks).where(eq(tasks.id, id));
    if (!task) return undefined;
    return {
      ...task,
      weekDays: task.weekDays ? JSON.parse(task.weekDays) : null,
      photoUrls: task.photoUrls ? JSON.parse(task.photoUrls) : [],
    } as Task;
  }

  /**
   * Создание новой задачи
   * @param insertTask - Данные задачи (companyId опционален)
   * @returns Созданная задача с id
   * @note weekDays и photoUrls автоматически сериализуются в JSON для хранения
   */
  async createTask(insertTask: InsertTask & { companyId?: number }): Promise<Task> {
    // Сериализуем weekDays и photoUrls в JSON строку для хранения в БД
    const taskData = {
      ...insertTask,
      weekDays: insertTask.weekDays ? JSON.stringify(insertTask.weekDays) : null,
      photoUrls: insertTask.photoUrls ? JSON.stringify(insertTask.photoUrls) : null,
      monthDay: insertTask.monthDay ?? null,
      isRecurring: insertTask.isRecurring ?? true,
      price: insertTask.price ?? 0,
      category: insertTask.category ?? null,
      description: insertTask.description ?? null,
      examplePhotoUrl: insertTask.examplePhotoUrl ?? null,
      companyId: insertTask.companyId ?? null,
      journalLink: insertTask.journalLink ?? null,
      createdAt: Math.floor(Date.now() / 1000),
      completedAt: null,
    };
    const [result] = await db.insert(tasks).values(taskData as any);
    const insertId = (result as any).insertId;
    const [task] = await db.select({
      id: tasks.id,
      title: tasks.title,
      workerId: tasks.workerId,
      requiresPhoto: tasks.requiresPhoto,
      photoUrl: tasks.photoUrl,
      photoUrls: tasks.photoUrls,
      examplePhotoUrl: tasks.examplePhotoUrl,
      isCompleted: tasks.isCompleted,
      weekDays: tasks.weekDays,
      monthDay: tasks.monthDay,
      isRecurring: tasks.isRecurring,
      price: tasks.price,
      category: tasks.category,
      description: tasks.description,
      companyId: tasks.companyId,
      journalLink: tasks.journalLink,
      createdAt: tasks.createdAt,
      completedAt: tasks.completedAt,
      claimedByWorkerId: tasks.claimedByWorkerId,
    }).from(tasks).where(eq(tasks.id, insertId));
    return {
      ...task,
      weekDays: task.weekDays ? JSON.parse(task.weekDays) : null,
      photoUrls: task.photoUrls ? JSON.parse(task.photoUrls) : [],
    } as Task;
  }

  /**
   * Частичное обновление задачи
   * @param id - ID задачи
   * @param updates - Поля для обновления (только переданные поля будут изменены)
   * @returns Обновлённая задача или undefined если не найдена
   * @example
   * // Отметить выполненной
   * await storage.updateTask(taskId, { isCompleted: true });
   * // Добавить фото
   * await storage.updateTask(taskId, { photoUrls: [...existing, newUrl] });
   */
  async updateTask(id: number, updates: Partial<InsertTask>): Promise<Task | undefined> {
    // Сериализуем weekDays и photoUrls если они переданы
    const updateData: Record<string, unknown> = {
      ...updates,
      weekDays: updates.weekDays !== undefined
        ? (updates.weekDays ? JSON.stringify(updates.weekDays) : null)
        : undefined,
      photoUrls: updates.photoUrls !== undefined
        ? (updates.photoUrls ? JSON.stringify(updates.photoUrls) : null)
        : undefined,
    };
    // Stamp completedAt whenever isCompleted flips. Setting true assigns
    // «now» (seconds); setting false clears the column so the next toggle
    // gets a fresh timestamp. Recurring tasks auto-reset elsewhere — they
    // hit this path with isCompleted=false at midnight.
    if ("isCompleted" in updates) {
      updateData.completedAt = updates.isCompleted
        ? Math.floor(Date.now() / 1000)
        : null;
    }
    // Удаляем undefined поля
    Object.keys(updateData).forEach(key => {
      if (updateData[key as keyof typeof updateData] === undefined) {
        delete updateData[key as keyof typeof updateData];
      }
    });
    await db.update(tasks).set(updateData as any).where(eq(tasks.id, id));
    const [task] = await db.select({
      id: tasks.id,
      title: tasks.title,
      workerId: tasks.workerId,
      requiresPhoto: tasks.requiresPhoto,
      photoUrl: tasks.photoUrl,
      photoUrls: tasks.photoUrls,
      examplePhotoUrl: tasks.examplePhotoUrl,
      isCompleted: tasks.isCompleted,
      weekDays: tasks.weekDays,
      monthDay: tasks.monthDay,
      isRecurring: tasks.isRecurring,
      price: tasks.price,
      category: tasks.category,
      description: tasks.description,
      companyId: tasks.companyId,
      journalLink: tasks.journalLink,
      createdAt: tasks.createdAt,
      completedAt: tasks.completedAt,
      claimedByWorkerId: tasks.claimedByWorkerId,
    }).from(tasks).where(eq(tasks.id, id));
    if (!task) return undefined;
    return {
      ...task,
      weekDays: task.weekDays ? JSON.parse(task.weekDays) : null,
      photoUrls: task.photoUrls ? JSON.parse(task.photoUrls) : [],
    } as Task;
  }

  async deleteTask(id: number): Promise<void> {
    await db.delete(tasks).where(eq(tasks.id, id));
  }

  /**
   * «Claim race-for-bonus»: помечаем sibling-задачи как выполненные
   * победителем. Sibling определяется как другая task с тем же
   * `journalLink.documentId + kind`, в той же компании, не выполненная,
   * принадлежащая другому воркеру. Премию им НЕ начисляем — это
   * сделает caller только для самой задачи.
   *
   * Возвращает количество захваченных задач (для логов / уведомлений).
   *
   * Реализация: тянем потенциальных кандидатов (журнальные задачи той
   * же компании), фильтруем в коде — JSON-блоб `journal_link` хранится
   * как TEXT, фильтр через JSON_EXTRACT в MySQL добавит нагрузку и
   * сделает миграцию платформо-зависимой. Кандидатов мало (≤ N
   * сотрудников за день), цикл дешёвый.
   */
  async claimSiblingTasks(args: {
    sourceTaskId: number;
    documentId: string;
    journalKind: string;
    claimedByWorkerId: number;
    companyId: number | null;
    completedAt: number;
  }): Promise<number> {
    const candidates = await db
      .select({
        id: tasks.id,
        workerId: tasks.workerId,
        isCompleted: tasks.isCompleted,
        journalLink: tasks.journalLink,
        claimedByWorkerId: tasks.claimedByWorkerId,
      })
      .from(tasks)
      .where(
        args.companyId !== null
          ? and(eq(tasks.companyId, args.companyId), eq(tasks.isCompleted, false))
          : eq(tasks.isCompleted, false)
      );

    let claimed = 0;
    for (const candidate of candidates) {
      if (candidate.id === args.sourceTaskId) continue;
      if (!candidate.journalLink) continue;
      if (candidate.claimedByWorkerId !== null) continue;
      let parsed: any;
      try {
        parsed = JSON.parse(candidate.journalLink);
      } catch {
        continue;
      }
      if (
        parsed?.documentId !== args.documentId ||
        parsed?.kind !== args.journalKind
      ) {
        continue;
      }
      await db
        .update(tasks)
        .set({
          isCompleted: true,
          completedAt: args.completedAt,
          claimedByWorkerId: args.claimedByWorkerId,
        })
        .where(eq(tasks.id, candidate.id));
      claimed += 1;
    }
    return claimed;
  }

  /**
   * Атомарный переход isCompleted=false → true. Если 0 rows
   * (задача не существует или уже completed) — возвращаем false.
   * Используется в /complete handler чтобы не начислять баланс
   * дважды при параллельных или повторных POST'ах.
   */
  async transitionTaskToCompleted(id: number): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const result = await db
      .update(tasks)
      .set({ isCompleted: true, completedAt: now })
      .where(and(eq(tasks.id, id), eq(tasks.isCompleted, false)));
    // mysql2 возвращает [ResultSetHeader, FieldPacket[]]. У ResultSetHeader
    // есть affectedRows (= rows которые matched WHERE и были обновлены).
    // Drizzle's типы могут варьироваться — приводим осторожно.
    const header = Array.isArray(result) ? result[0] : result;
    const affected =
      header && typeof header === "object" && "affectedRows" in header
        ? (header as { affectedRows: number }).affectedRows
        : 0;
    return affected > 0;
  }

  /**
   * Атомарный обратный переход isCompleted=true → false. Двойник
   * `transitionTaskToCompleted`. Без него concurrent /uncomplete мог
   * дважды вычитать price из баланса воркера: оба читали
   * isCompleted=true, оба делали updateUserBalance(-price), баланс
   * уходил в минус. Теперь только один вызов получает affected>0
   * и вычитает.
   */
  async transitionTaskToUncompleted(id: number): Promise<boolean> {
    const result = await db
      .update(tasks)
      .set({ isCompleted: false, completedAt: null })
      .where(and(eq(tasks.id, id), eq(tasks.isCompleted, true)));
    const header = Array.isArray(result) ? result[0] : result;
    const affected =
      header && typeof header === "object" && "affectedRows" in header
        ? (header as { affectedRows: number }).affectedRows
        : 0;
    return affected > 0;
  }

  // ===================== API KEYS =====================

  async createApiKey(data: Omit<InsertApiKey, 'id' | 'createdAt'>): Promise<ApiKey> {
    const now = Math.floor(Date.now() / 1000);
    const insert = { ...data, createdAt: now } as InsertApiKey;
    const [result] = await db.insert(apiKeys).values(insert);
    const id = (result as any).insertId as number;
    const row = await this.getApiKeyById(id);
    if (!row) throw new Error('api_key not found after insert');
    return row;
  }

  async getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined> {
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).limit(1);
    return rows[0];
  }

  async getApiKeyById(id: number): Promise<ApiKey | undefined> {
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).limit(1);
    return rows[0];
  }

  async listApiKeysByCompany(companyId: number): Promise<ApiKey[]> {
    return db.select().from(apiKeys)
      .where(eq(apiKeys.companyId, companyId))
      .orderBy(desc(apiKeys.createdAt));
  }

  async revokeApiKey(id: number): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await db.update(apiKeys).set({ revokedAt: now }).where(eq(apiKeys.id, id));
  }

  async updateApiKeyLastUsed(id: number, ts: number): Promise<void> {
    await db.update(apiKeys).set({ lastUsedAt: ts }).where(eq(apiKeys.id, id));
  }

  async countActiveApiKeysByCompany(companyId: number): Promise<number> {
    const rows = await db.select().from(apiKeys)
      .where(and(eq(apiKeys.companyId, companyId), eq(apiKeys.revokedAt, 0)));
    return rows.length;
  }

  // Webhook deliveries — очередь повторных доставок POST'ов в WeSetup.
  // См. shared/schema.ts комментарий к webhookDeliveries для деталей
  // backoff-лестницы. Storage даёт только CRUD; политика retry —
  // в server/index.ts (worker).

  async enqueueWebhookDelivery(input: {
    taskId: number;
    eventType: "complete" | "uncomplete";
    targetUrl: string;
    apiKey: string;
    payload: string;
    nextRetryAt: number;
  }): Promise<WebhookDelivery> {
    const now = Math.floor(Date.now() / 1000);
    const insert: InsertWebhookDelivery = {
      taskId: input.taskId,
      eventType: input.eventType,
      targetUrl: input.targetUrl,
      apiKey: input.apiKey,
      payload: input.payload,
      attempts: 0,
      status: 0,
      nextRetryAt: input.nextRetryAt,
      createdAt: now,
      updatedAt: now,
    };
    const [r] = await db.insert(webhookDeliveries).values(insert);
    const id = r.insertId;
    const [row] = await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, id));
    return row;
  }

  /** Pull pending deliveries due for retry. */
  async listPendingWebhookDeliveries(limit: number, now: number): Promise<WebhookDelivery[]> {
    return await db
      .select()
      .from(webhookDeliveries)
      .where(and(eq(webhookDeliveries.status, 0), lte(webhookDeliveries.nextRetryAt, now)))
      .orderBy(asc(webhookDeliveries.nextRetryAt))
      .limit(limit);
  }

  async markWebhookDeliveryAttempt(input: {
    id: number;
    attempts: number;
    status: 0 | 1 | 2 | 3;
    nextRetryAt: number;
    lastError: string | null;
  }): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await db
      .update(webhookDeliveries)
      .set({
        attempts: input.attempts,
        status: input.status,
        nextRetryAt: input.nextRetryAt,
        lastError: input.lastError,
        updatedAt: now,
      })
      .where(eq(webhookDeliveries.id, input.id));
  }

  // ===================== INVITATIONS =====================

  async createInvitation(data: {
    token: string;
    companyId: number;
    createdByUserId: number;
    position: string | null;
    isAdmin: boolean;
  }): Promise<Invitation> {
    const now = Math.floor(Date.now() / 1000);
    const [result] = await db.insert(invitations).values({
      token: data.token,
      companyId: data.companyId,
      createdByUserId: data.createdByUserId,
      position: data.position,
      isAdmin: data.isAdmin,
      createdAt: now,
    });
    const insertId = (result as any).insertId;
    const [row] = await db.select().from(invitations).where(eq(invitations.id, insertId));
    if (!row) throw new Error("Failed to create invitation");
    return row;
  }

  async getInvitationById(id: number): Promise<Invitation | undefined> {
    const [row] = await db.select().from(invitations).where(eq(invitations.id, id));
    return row || undefined;
  }

  async getInvitationByToken(token: string): Promise<Invitation | undefined> {
    const [row] = await db.select().from(invitations).where(eq(invitations.token, token));
    return row || undefined;
  }

  async getInvitationsByCompany(companyId: number, includeAll: boolean): Promise<Invitation[]> {
    if (includeAll) {
      return await db
        .select()
        .from(invitations)
        .where(eq(invitations.companyId, companyId))
        .orderBy(desc(invitations.createdAt));
    }
    return await db
      .select()
      .from(invitations)
      .where(
        and(
          eq(invitations.companyId, companyId),
          isNull(invitations.usedAt),
          isNull(invitations.revokedAt),
        ),
      )
      .orderBy(desc(invitations.createdAt));
  }

  /**
   * Атомарно помечает приглашение как использованное.
   * Возвращает true если получилось, false — если кто-то уже использовал
   * или приглашение отозвано (race condition при параллельных accept'ах).
   */
  async markInvitationUsed(id: number, usedByUserId: number): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const result = await db
      .update(invitations)
      .set({ usedAt: now, usedByUserId })
      .where(
        and(
          eq(invitations.id, id),
          isNull(invitations.usedAt),
          isNull(invitations.revokedAt),
        ),
      );
    const affected = (result as any).affectedRows ?? (result as any)[0]?.affectedRows ?? 0;
    return affected > 0;
  }

  async revokeInvitation(id: number): Promise<Invitation | undefined> {
    const now = Math.floor(Date.now() / 1000);
    await db
      .update(invitations)
      .set({ revokedAt: now })
      .where(
        and(
          eq(invitations.id, id),
          isNull(invitations.revokedAt),
          isNull(invitations.usedAt),
        ),
      );
    return await this.getInvitationById(id);
  }
}

export const storage = new DatabaseStorage();
