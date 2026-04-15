/**
 * @fileoverview Data Access Layer для работы с MySQL через Drizzle ORM
 *
 * Все методы работают с тремя таблицами: users, tasks, workers
 *
 * ВАЖНО: weekDays и photoUrls хранятся в БД как JSON строки,
 * но возвращаются как массивы (парсинг при чтении, сериализация при записи)
 */

import { workers, tasks, users, companies, apiKeys, type Worker, type InsertWorker, type Task, type InsertTask, type User, type InsertUser, type UpdateUser, type Company, type InsertCompany, type ApiKey, type InsertApiKey } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc } from "drizzle-orm";

/** Интерфейс хранилища данных */
export interface IStorage {
  // Companies
  createCompany(company: InsertCompany): Promise<Company>;
  getCompanyById(id: number): Promise<Company | undefined>;
  updateCompany(id: number, company: Partial<InsertCompany>): Promise<Company | undefined>;

  // Users
  getUserByPhone(phone: string): Promise<User | undefined>;
  createUser(user: InsertUser & { companyId?: number }): Promise<User>;
  getUserById(id: number): Promise<User | undefined>;
  getAllUsers(companyId?: number): Promise<User[]>;
  updateUser(id: number, user: UpdateUser): Promise<User | undefined>;
  updateUserBalance(id: number, amount: number): Promise<User | undefined>;
  resetUserBalance(id: number): Promise<User | undefined>;
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

  // API Keys
  createApiKey(data: Omit<InsertApiKey, 'id' | 'createdAt'>): Promise<ApiKey>;
  getApiKeyByHash(keyHash: string): Promise<ApiKey | undefined>;
  getApiKeyById(id: number): Promise<ApiKey | undefined>;
  listApiKeysByCompany(companyId: number): Promise<ApiKey[]>;
  revokeApiKey(id: number): Promise<void>;
  updateApiKeyLastUsed(id: number, ts: number): Promise<void>;
  countActiveApiKeysByCompany(companyId: number): Promise<number>;
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
  async updateCompany(id: number, company: Partial<InsertCompany>): Promise<Company | undefined> {
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
    const normalizedPhone = phone.replace(/\s+/g, "").replace(/-/g, "");
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
    const normalizedPhone = insertUser.phone.replace(/\s+/g, "").replace(/-/g, "");
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
    const normalizedPhone = updateUser.phone.replace(/\s+/g, "").replace(/-/g, "");
    await db.update(users).set({
      phone: normalizedPhone,
      name: updateUser.name ?? null,
    }).where(eq(users.id, id));
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
    const [existingUser] = await db.select().from(users).where(eq(users.id, id));
    if (!existingUser) return undefined;

    const newBalance = (existingUser.bonusBalance || 0) + amount;
    await db.update(users).set({ bonusBalance: newBalance }).where(eq(users.id, id));

    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  /** Сброс баланса пользователя до 0 (вызывается админом после выплаты) */
  async resetUserBalance(id: number): Promise<User | undefined> {
    await db.update(users).set({ bonusBalance: 0 }).where(eq(users.id, id));
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
    const updateData = {
      ...updates,
      weekDays: updates.weekDays !== undefined
        ? (updates.weekDays ? JSON.stringify(updates.weekDays) : null)
        : undefined,
      photoUrls: updates.photoUrls !== undefined
        ? (updates.photoUrls ? JSON.stringify(updates.photoUrls) : null)
        : undefined,
    };
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
}

export const storage = new DatabaseStorage();
