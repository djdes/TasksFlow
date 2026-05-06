/**
 * Валидация журнальной формы (TaskFormFiller).
 *
 * Извлечено из useMemo чтобы тестировать без React/dialog state.
 *
 * Журнальные формы критичны: если воркер отправит пустые
 * required-поля, сервер WeSetup откинет с ошибкой, воркер ругнётся
 * «программа сломалась» — а на самом деле просто галка required
 * не отрабатывала. Тесты прибивают рабочее поведение.
 */

import type { TaskFormField, TaskFormSchema } from "@shared/wesetup-journal-mode";

/**
 * Готова ли форма к submit'у — все required-поля заполнены валидными
 * значениями, числа в диапазоне min/max если задан.
 */
export function isFormReadyToSubmit(
  schema: TaskFormSchema | null | undefined,
  values: Record<string, unknown>,
): boolean {
  if (!schema) return false;
  for (const field of schema.fields) {
    if (!field.required) continue;
    if (!isFieldValueValid(field, values[field.key])) return false;
  }
  return true;
}

/**
 * Валидно ли отдельное значение для конкретного field.
 *   • массив (multi-select) пустой → false
 *   • NaN → false
 *   • для file/photo/image нужен object
 *   • null/undefined/'' → false
 *   • для number вне min/max → false
 */
export function isFieldValueValid(
  field: TaskFormField,
  v: unknown,
): boolean {
  if (Array.isArray(v) && v.length === 0) return false;
  if (typeof v === "number" && Number.isNaN(v)) return false;
  if (
    field.type === "file" ||
    field.type === "photo" ||
    field.type === "image"
  ) {
    return !!v && typeof v === "object";
  }
  if (v === null || v === undefined || v === "") return false;
  if (field.type === "number" && typeof v === "number") {
    if (typeof field.min === "number" && v < field.min) return false;
    if (typeof field.max === "number" && v > field.max) return false;
  }
  return true;
}
