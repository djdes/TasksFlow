/**
 * Тесты isFormReadyToSubmit / isFieldValueValid.
 *
 * UX-критическая логика: если кто-то сломает required-валидацию,
 * воркер пошлёт пустые поля → WeSetup откинет → «ошибка отправки»,
 * человек не понимает что не так.
 */

import { describe, it, expect } from "vitest";
import {
  isFieldValueValid,
  isFormReadyToSubmit,
} from "../client/src/lib/task-form-validate";
import type {
  TaskFormField,
  TaskFormSchema,
} from "../shared/wesetup-journal-mode";

const textField: TaskFormField = {
  type: "text",
  key: "comment",
  label: "Комментарий",
  required: true,
};

const numField: TaskFormField = {
  type: "number",
  key: "temp",
  label: "Температура",
  required: true,
};

const photoField: TaskFormField = {
  type: "photo",
  key: "photo",
  label: "Фото",
  required: true,
};

const optionalField: TaskFormField = {
  type: "text",
  key: "note",
  label: "Заметка",
  // required не указано → optional
};

describe("isFieldValueValid — text field", () => {
  it("непустая строка → true", () => {
    expect(isFieldValueValid(textField, "ок")).toBe(true);
  });
  it("'' → false", () => {
    expect(isFieldValueValid(textField, "")).toBe(false);
  });
  it("null → false", () => {
    expect(isFieldValueValid(textField, null)).toBe(false);
  });
  it("undefined → false", () => {
    expect(isFieldValueValid(textField, undefined)).toBe(false);
  });
});

describe("isFieldValueValid — number field", () => {
  it("число в диапазоне → true", () => {
    expect(isFieldValueValid({ ...numField, min: 35, max: 42 }, 36.6)).toBe(
      true,
    );
  });
  it("число ниже min → false", () => {
    expect(isFieldValueValid({ ...numField, min: 35, max: 42 }, 30)).toBe(
      false,
    );
  });
  it("число выше max → false", () => {
    expect(isFieldValueValid({ ...numField, min: 35, max: 42 }, 50)).toBe(
      false,
    );
  });
  it("0 → true (если без min)", () => {
    expect(isFieldValueValid(numField, 0)).toBe(true);
  });
  it("NaN → false", () => {
    expect(isFieldValueValid(numField, NaN)).toBe(false);
  });
  it("без min/max → любое число → true", () => {
    expect(isFieldValueValid(numField, 1000)).toBe(true);
    expect(isFieldValueValid(numField, -100)).toBe(true);
  });
});

describe("isFieldValueValid — array (multi-select)", () => {
  const checkboxField: TaskFormField = {
    type: "checkbox-group",
    key: "items",
    label: "Что сделано",
    required: true,
  };

  it("non-empty array → true", () => {
    expect(isFieldValueValid(checkboxField, ["a", "b"])).toBe(true);
  });

  it("empty array → false", () => {
    expect(isFieldValueValid(checkboxField, [])).toBe(false);
  });
});

describe("isFieldValueValid — photo/file/image", () => {
  it("photo с object value → true", () => {
    expect(isFieldValueValid(photoField, { url: "blob:..." })).toBe(true);
  });
  it("photo с null → false", () => {
    expect(isFieldValueValid(photoField, null)).toBe(false);
  });
  it("photo с empty string → false", () => {
    expect(isFieldValueValid(photoField, "")).toBe(false);
  });
});

describe("isFormReadyToSubmit", () => {
  it("schema=null → false", () => {
    expect(isFormReadyToSubmit(null, {})).toBe(false);
  });

  it("schema=undefined → false", () => {
    expect(isFormReadyToSubmit(undefined, {})).toBe(false);
  });

  it("required field заполнен → true", () => {
    const schema: TaskFormSchema = { fields: [textField] };
    expect(isFormReadyToSubmit(schema, { comment: "ок" })).toBe(true);
  });

  it("required field пуст → false", () => {
    const schema: TaskFormSchema = { fields: [textField] };
    expect(isFormReadyToSubmit(schema, {})).toBe(false);
  });

  it("optional field пуст → true (required-only check)", () => {
    const schema: TaskFormSchema = { fields: [optionalField] };
    expect(isFormReadyToSubmit(schema, {})).toBe(true);
  });

  it("несколько required, один не заполнен → false", () => {
    const schema: TaskFormSchema = {
      fields: [textField, numField],
    };
    expect(isFormReadyToSubmit(schema, { comment: "ок" })).toBe(false);
    expect(isFormReadyToSubmit(schema, { comment: "ок", temp: 36.6 })).toBe(
      true,
    );
  });

  it("несколько required + один optional → required важнее", () => {
    const schema: TaskFormSchema = {
      fields: [textField, optionalField],
    };
    expect(isFormReadyToSubmit(schema, {})).toBe(false);
    expect(isFormReadyToSubmit(schema, { comment: "ок" })).toBe(true);
  });

  it("required photo с null → false", () => {
    const schema: TaskFormSchema = { fields: [photoField] };
    expect(isFormReadyToSubmit(schema, { photo: null })).toBe(false);
  });

  it("required number вне range → false", () => {
    const schema: TaskFormSchema = {
      fields: [{ ...numField, min: 35, max: 42 }],
    };
    expect(isFormReadyToSubmit(schema, { temp: 100 })).toBe(false);
    expect(isFormReadyToSubmit(schema, { temp: 36.6 })).toBe(true);
  });

  it("schema без fields массива → true (нечего проверять)", () => {
    const schema = { fields: [] } as TaskFormSchema;
    expect(isFormReadyToSubmit(schema, {})).toBe(true);
  });
});
