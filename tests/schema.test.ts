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
