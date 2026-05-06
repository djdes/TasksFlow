/**
 * Форматирование field-value для confirm-summary в TaskFormFiller.
 *
 * Используется в финальном «Подтвердите данные» диалоге — показывает
 * человеко-читаемое resume («Температура: 36.6 °C» вместо JSON
 * блоба). Извлечено из TaskFormFiller.tsx чтобы тестировать без
 * React и mock'а файлов.
 */

import type { TaskFormField } from "@shared/wesetup-journal-mode";

/**
 * Возвращает строку для отображения значения поля. Пустые значения
 * → «—»; multi-select объединяется через «, »; для select/radio
 * подставляется label из options; для boolean — «Да/Нет»; для
 * number — добавляется unit если задан.
 */
export function formatTaskFormValue(
  field: TaskFormField,
  value: unknown,
): string {
  if (value === null || value === undefined || value === "") return "—";

  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    const options = Array.isArray(field.options) ? field.options : [];
    return value
      .map((item) => {
        const opt = options.find((o) => o.value === String(item));
        return opt
          ? `${opt.code ? opt.code + " — " : ""}${opt.label}`
          : String(item);
      })
      .join(", ");
  }

  if (typeof value === "object") {
    const file = value as { name?: unknown };
    if (typeof file.name === "string") return file.name;
    return JSON.stringify(value);
  }

  switch (field.type) {
    case "boolean":
      return value ? "Да" : "Нет";
    case "radio":
    case "select": {
      const options = Array.isArray(field.options) ? field.options : [];
      const opt = options.find((o) => o.value === value);
      return opt
        ? `${opt.code ? opt.code + " — " : ""}${opt.label}`
        : String(value);
    }
    case "number":
      return field.unit ? `${value} ${field.unit}` : String(value);
    default:
      return String(value);
  }
}
