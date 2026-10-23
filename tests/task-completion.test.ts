import { describe, expect, it } from "vitest";
import { applyCompletionToList } from "../client/src/lib/task-completion";
import type { Task } from "../shared/schema";

const task = (id: number, extra: Partial<Task> = {}) =>
  ({ id, title: `t${id}`, isCompleted: false, completedAt: null, weekDays: [1, 2], ...extra }) as unknown as Task;

describe("applyCompletionToList", () => {
  it("помечает выполненной только ту задачу, что подтвердил сервер", () => {
    const list = [task(1), task(2)];
    const next = applyCompletionToList(list, { id: 2, isCompleted: true, completedAt: 1700000000 });
    expect(next?.[0]).toBe(list[0]);
    expect(next?.[1]).toMatchObject({ id: 2, isCompleted: true, completedAt: 1700000000 });
  });

  it("не затирает нормализованные поля списка сырыми полями ответа", () => {
    const list = [task(1)];
    const next = applyCompletionToList(list, { id: 1, isCompleted: true, completedAt: 5, weekDays: "[1,2]" } as never);
    expect(next?.[0].weekDays).toEqual([1, 2]);
  });

  it("оставляет список как есть, если ответ без флага выполнения", () => {
    const list = [task(1)];
    expect(applyCompletionToList(list, { id: 1 })).toBe(list);
    expect(applyCompletionToList(list, null)).toBe(list);
    expect(applyCompletionToList(undefined, { id: 1, isCompleted: true })).toBeUndefined();
  });

  it("сохраняет прежнее время, если сервер его не вернул", () => {
    const list = [task(1, { completedAt: 42 } as Partial<Task>)];
    expect(applyCompletionToList(list, { id: 1, isCompleted: true })?.[0].completedAt).toBe(42);
  });

  it("задача на проверке сразу получает статус submitted", () => {
    const list = [task(1)];
    const next = applyCompletionToList(list, { id: 1, isCompleted: false, verificationStatus: "submitted" });
    expect(next?.[0]).toMatchObject({ isCompleted: false, verificationStatus: "submitted" });
  });

  it("повторное выполнение возвращённой задачи снимает пометку возврата", () => {
    const list = [task(1, { verificationStatus: "rejected", rejectReason: "Нет фото" } as Partial<Task>)];
    const next = applyCompletionToList(list, { id: 1, isCompleted: true, verificationStatus: null, rejectReason: null });
    expect(next?.[0]).toMatchObject({ isCompleted: true, verificationStatus: null, rejectReason: null });
  });
});
