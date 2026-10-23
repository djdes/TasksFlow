/**
 * Шаблоны задач по отраслям: каждый шаблон должен проходить ту же
 * валидацию, что и POST /api/tasks, иначе «Создать 10 задач» упадёт
 * на сервере с 400 уже у пользователя.
 */
import { describe, it, expect, vi } from "vitest";
import { insertTaskSchema } from "@shared/schema";
import {
  TASK_TEMPLATE_INDUSTRIES,
  createTemplateTasks,
  getTaskTemplateIndustry,
  templateTaskPayload,
} from "../client/src/lib/task-templates";

describe("TASK_TEMPLATE_INDUSTRIES", () => {
  it("семь отраслей с уникальными id", () => {
    const ids = TASK_TEMPLATE_INDUSTRIES.map((i) => i.id);
    expect(ids).toHaveLength(7);
    expect(new Set(ids).size).toBe(7);
    expect(TASK_TEMPLATE_INDUSTRIES.map((i) => i.name)).toEqual([
      "Клининг",
      "Общепит",
      "Розница",
      "Сервис и ремонт",
      "Логистика",
      "Охрана",
      "Производство",
    ]);
  });

  for (const industry of TASK_TEMPLATE_INDUSTRIES) {
    describe(industry.name, () => {
      it("8–12 задач без повторов названий", () => {
        expect(industry.tasks.length).toBeGreaterThanOrEqual(8);
        expect(industry.tasks.length).toBeLessThanOrEqual(12);
        const titles = industry.tasks.map((t) => t.title);
        expect(new Set(titles).size).toBe(titles.length);
      });

      it("описание — одна непустая строка, расписание — целые дни 0–6", () => {
        for (const t of industry.tasks) {
          expect(t.description.trim().length).toBeGreaterThan(0);
          expect(t.description).not.toMatch(/\n/);
          expect(t.category.trim().length).toBeGreaterThan(0);
          if (t.weekDays !== null) {
            expect(t.weekDays.length).toBeGreaterThan(0);
            for (const d of t.weekDays) {
              expect(Number.isInteger(d) && d >= 0 && d <= 6).toBe(true);
            }
          }
        }
      });

      it("каждый шаблон проходит insertTaskSchema", () => {
        for (const t of industry.tasks) {
          const result = insertTaskSchema.safeParse(templateTaskPayload(t, 7));
          expect(result.success, `${t.title}: ${result.success ? "" : result.error.message}`).toBe(true);
        }
      });

      it("есть задачи с фото — именно их потом проверяет руководитель", () => {
        expect(industry.tasks.some((t) => t.requiresPhoto)).toBe(true);
      });
    });
  }
});

describe("templateTaskPayload", () => {
  it("повторяющаяся задача без срока и премии, на выбранного сотрудника", () => {
    const template = getTaskTemplateIndustry("food")!.tasks[0];
    expect(templateTaskPayload(template, 42)).toEqual({
      title: template.title,
      workerId: 42,
      requiresPhoto: template.requiresPhoto,
      weekDays: template.weekDays,
      monthDay: null,
      dueDate: null,
      isRecurring: true,
      price: 0,
      category: template.category,
      description: template.description,
      checklist: null,
    });
  });

  it("неизвестная отрасль — undefined, а не падение", () => {
    expect(getTaskTemplateIndustry("space")).toBeUndefined();
  });
});

describe("createTemplateTasks", () => {
  const tasks = getTaskTemplateIndustry("security")!.tasks.slice(0, 4);

  it("создаёт по одной и сообщает прогресс", async () => {
    const order: string[] = [];
    const post = vi.fn(async (payload: { title: string }) => {
      order.push(payload.title);
    });
    const progress = vi.fn();
    const result = await createTemplateTasks(tasks, 3, post, progress);
    expect(result).toEqual({ created: 4, failures: [] });
    expect(order).toEqual(tasks.map((t) => t.title));
    expect(progress.mock.calls).toEqual([[1, 4], [2, 4], [3, 4], [4, 4]]);
  });

  it("ошибка одной задачи не останавливает остальные, причина сохраняется", async () => {
    const post = vi.fn(async (payload: { title: string }) => {
      if (payload.title === tasks[1].title) throw new Error("Сотрудник не найден");
      if (payload.title === tasks[2].title) throw "not an Error";
    });
    const result = await createTemplateTasks(tasks, 3, post);
    expect(post).toHaveBeenCalledTimes(4);
    expect(result.created).toBe(2);
    expect(result.failures).toEqual([
      { template: tasks[1], message: "Сотрудник не найден" },
      { template: tasks[2], message: "Не удалось создать задачу" },
    ]);
  });
});
