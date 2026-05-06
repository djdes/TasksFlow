/**
 * Тесты валидации схем Zod
 */

import { describe, it, expect } from "vitest";
import {
  loginSchema,
  insertUserSchema,
  updateUserSchema,
  insertTaskSchema,
  insertCompanySchema,
  registerCompanySchema,
} from "@shared/schema";

describe("loginSchema", () => {
  it("должна принимать валидный российский номер +7XXXXXXXXXX", () => {
    const result = loginSchema.safeParse({ phone: "+79991234567" });
    expect(result.success).toBe(true);
  });

  it("должна принимать номер с пробелами", () => {
    const result = loginSchema.safeParse({ phone: "+7 999 123 45 67" });
    expect(result.success).toBe(true);
  });

  it("должна принимать номер с дефисами", () => {
    const result = loginSchema.safeParse({ phone: "+7-999-123-45-67" });
    expect(result.success).toBe(true);
  });

  it("должна отклонять номер без +7", () => {
    const result = loginSchema.safeParse({ phone: "89991234567" });
    expect(result.success).toBe(false);
  });

  it("должна отклонять слишком короткий номер", () => {
    const result = loginSchema.safeParse({ phone: "+7999" });
    expect(result.success).toBe(false);
  });

  it("должна отклонять пустую строку", () => {
    const result = loginSchema.safeParse({ phone: "" });
    expect(result.success).toBe(false);
  });

  it("должна отклонять номер с буквами", () => {
    const result = loginSchema.safeParse({ phone: "+7999abc4567" });
    expect(result.success).toBe(false);
  });
});

describe("insertUserSchema", () => {
  it("должна принимать пользователя с телефоном и именем", () => {
    const result = insertUserSchema.safeParse({
      phone: "+79991234567",
      name: "Иван Иванов",
    });
    expect(result.success).toBe(true);
  });

  it("должна принимать пользователя только с телефоном", () => {
    const result = insertUserSchema.safeParse({
      phone: "+79991234567",
    });
    expect(result.success).toBe(true);
  });

  it("должна отклонять пользователя без телефона", () => {
    const result = insertUserSchema.safeParse({
      name: "Иван Иванов",
    });
    expect(result.success).toBe(false);
  });

  it("должна устанавливать isAdmin = false по умолчанию", () => {
    const result = insertUserSchema.safeParse({
      phone: "+79991234567",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isAdmin).toBe(false);
    }
  });
});

describe("insertTaskSchema", () => {
  it("должна принимать минимальную задачу", () => {
    const result = insertTaskSchema.safeParse({
      title: "Помыть полы",
    });
    expect(result.success).toBe(true);
  });

  it("должна принимать задачу со всеми полями", () => {
    const result = insertTaskSchema.safeParse({
      title: "Помыть полы",
      workerId: 1,
      requiresPhoto: true,
      weekDays: [1, 2, 3, 4, 5],
      monthDay: 15,
      price: 100,
      category: "Уборка",
      description: "Помыть полы во всех комнатах",
      isRecurring: true,
    });
    expect(result.success).toBe(true);
  });

  it("должна отклонять задачу без названия", () => {
    const result = insertTaskSchema.safeParse({
      workerId: 1,
    });
    expect(result.success).toBe(false);
  });

  it("должна отклонять невалидные дни недели", () => {
    const result = insertTaskSchema.safeParse({
      title: "Задача",
      weekDays: [0, 7], // 7 - невалидный день
    });
    expect(result.success).toBe(false);
  });

  it("должна отклонять невалидный день месяца", () => {
    const result = insertTaskSchema.safeParse({
      title: "Задача",
      monthDay: 32,
    });
    expect(result.success).toBe(false);
  });

  it("должна отклонять weekDays с float (1.5)", () => {
    // Регрессия: float проходил `.min(0).max(6)` без .int(), потом
    // в UI бейджах рендерился как «Пн, ,Ср» (WEEK_DAY_SHORT_NAMES[1.5]=
    // undefined). На сервере is-task-visible-today фильтр сравнивал
    // float !== integer dayOfWeek и задача не показывалась в свой день.
    const result = insertTaskSchema.safeParse({
      title: "Задача",
      weekDays: [1.5, 3],
    });
    expect(result.success).toBe(false);
  });

  it("должна отклонять monthDay с float (15.5)", () => {
    // Регрессия: 15.5 проходил .min(1).max(31), но getDate() integer
    // → задача не показывается в свой день.
    const result = insertTaskSchema.safeParse({
      title: "Задача",
      monthDay: 15.5,
    });
    expect(result.success).toBe(false);
  });

  it("должна отклонять отрицательную цену", () => {
    const result = insertTaskSchema.safeParse({
      title: "Задача",
      price: -100,
    });
    expect(result.success).toBe(false);
  });

  it("должна устанавливать значения по умолчанию", () => {
    const result = insertTaskSchema.safeParse({
      title: "Задача",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.isCompleted).toBe(false);
      expect(result.data.isRecurring).toBe(true);
      expect(result.data.price).toBe(0);
    }
  });
});

// ===================== CAPS — silent-truncation protection =====================
//
// Регрессия для тиков 32-35: MySQL VARCHAR cap'ает значения тихо без
// strict mode, потеря данных без видимой ошибки. Все user-input поля
// должны иметь .max(N), совпадающий с DB column. Если эти тесты падают
// после изменения schema — посмотри shared/schema.ts varchar(N) для
// колонки и добавь обратно .max().

describe("silent-truncation caps", () => {
  describe("insertUserSchema.name", () => {
    it("принимает имя 255 символов", () => {
      const r = insertUserSchema.safeParse({
        phone: "+79991234567",
        name: "и".repeat(255),
      });
      expect(r.success).toBe(true);
    });
    it("отклоняет имя 256 символов", () => {
      const r = insertUserSchema.safeParse({
        phone: "+79991234567",
        name: "и".repeat(256),
      });
      expect(r.success).toBe(false);
    });
  });

  describe("updateUserSchema.name", () => {
    it("принимает имя 255 символов", () => {
      const r = updateUserSchema.safeParse({
        phone: "+79991234567",
        name: "и".repeat(255),
      });
      expect(r.success).toBe(true);
    });
    it("отклоняет имя 256 символов", () => {
      const r = updateUserSchema.safeParse({
        phone: "+79991234567",
        name: "и".repeat(256),
      });
      expect(r.success).toBe(false);
    });
  });

  describe("insertUserSchema.position", () => {
    it("принимает должность 120 символов", () => {
      const r = insertUserSchema.safeParse({
        phone: "+79991234567",
        position: "д".repeat(120),
      });
      expect(r.success).toBe(true);
    });
    it("отклоняет должность 121 символ", () => {
      const r = insertUserSchema.safeParse({
        phone: "+79991234567",
        position: "д".repeat(121),
      });
      expect(r.success).toBe(false);
    });
  });

  describe("insertTaskSchema.title (drizzle-zod auto-cap check)", () => {
    it("принимает 255 символов", () => {
      const r = insertTaskSchema.safeParse({ title: "т".repeat(255) });
      expect(r.success).toBe(true);
    });
    it("отклоняет 256 символов (если drizzle-zod auto-cap'ит varchar(255))", () => {
      const r = insertTaskSchema.safeParse({ title: "т".repeat(256) });
      // Это документирует ожидаемое поведение createInsertSchema:
      // varchar(255) → автоматически .max(255). Если упадёт — нужно
      // ручной .max() добавлять как для других полей.
      expect(r.success).toBe(false);
    });
  });

  describe("insertTaskSchema.description (тик 87 фикс)", () => {
    it("принимает 5000 символов", () => {
      const r = insertTaskSchema.safeParse({
        title: "Test",
        description: "д".repeat(5000),
      });
      expect(r.success).toBe(true);
    });
    it("отклоняет 5001 символ", () => {
      const r = insertTaskSchema.safeParse({
        title: "Test",
        description: "д".repeat(5001),
      });
      expect(r.success).toBe(false);
    });
  });

  describe("insertTaskSchema.category", () => {
    it("принимает категорию 100 символов", () => {
      const r = insertTaskSchema.safeParse({
        title: "Задача",
        category: "к".repeat(100),
      });
      expect(r.success).toBe(true);
    });
    it("отклоняет категорию 101 символ", () => {
      const r = insertTaskSchema.safeParse({
        title: "Задача",
        category: "к".repeat(101),
      });
      expect(r.success).toBe(false);
    });
  });

  describe("registerCompanySchema", () => {
    it("отклоняет companyName > 255", () => {
      const r = registerCompanySchema.safeParse({
        phone: "+79991234567",
        companyName: "к".repeat(256),
        email: "a@b.c",
      });
      expect(r.success).toBe(false);
    });
    it("отклоняет email > 255", () => {
      const r = registerCompanySchema.safeParse({
        phone: "+79991234567",
        companyName: "ИП",
        email: "a".repeat(250) + "@b.c", // длиннее 255
      });
      expect(r.success).toBe(false);
    });
    it("отклоняет adminName > 255", () => {
      const r = registerCompanySchema.safeParse({
        phone: "+79991234567",
        companyName: "ИП",
        email: "a@b.c",
        adminName: "и".repeat(256),
      });
      expect(r.success).toBe(false);
    });
  });

  describe("insertCompanySchema", () => {
    it("отклоняет name > 255", () => {
      const r = insertCompanySchema.safeParse({
        name: "к".repeat(256),
      });
      expect(r.success).toBe(false);
    });
  });
});
