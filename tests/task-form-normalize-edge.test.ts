/**
 * Edge-case тесты для normalizeTaskFormPayload / normalizeTaskFormSchema.
 * Дополняют существующие positive-path тесты (tests/wesetup-journal-mode.test.ts)
 * — фокус на malformed/untrusted payloads от WeSetup. Если кто-то
 * ослабит type-guard'ы, мусор просочится в UI и React fallback'нется
 * к "Cannot read property 'X' of undefined".
 */

import { describe, it, expect } from "vitest";
import {
  normalizeTaskFormPayload,
  isTaskFormSchema,
} from "@shared/wesetup-journal-mode";

describe("normalizeTaskFormPayload — невалидные wrapper'ы", () => {
  it("null → null (form: null допустимо как «нет формы»)", () => {
    expect(normalizeTaskFormPayload(null)).toEqual({ form: null });
  });

  it("undefined → null (явное отсутствие)", () => {
    expect(normalizeTaskFormPayload(undefined)).toBeNull();
  });

  it("number → null (не object)", () => {
    expect(normalizeTaskFormPayload(42)).toBeNull();
  });

  it("array → нет fields → null", () => {
    expect(normalizeTaskFormPayload([])).toBeNull();
  });

  it("string → null", () => {
    expect(normalizeTaskFormPayload("not a payload")).toBeNull();
  });
});

describe("normalizeTaskFormPayload — без fields", () => {
  it("{ form: {} } → null (пустая schema без fields)", () => {
    expect(normalizeTaskFormPayload({ form: {} })).toBeNull();
  });

  it("{ taskForm: { fields: [] } } → null (пустой массив тоже отбрасываем)", () => {
    expect(normalizeTaskFormPayload({ taskForm: { fields: [] } })).toBeNull();
  });

  it("{ form: { fields: [{}, {}] } } → null (все items без key)", () => {
    expect(
      normalizeTaskFormPayload({ form: { fields: [{}, {}] } }),
    ).toBeNull();
  });
});

describe("normalizeTaskFormPayload — partial-valid fields", () => {
  it("один валидный + один без key → null (fields.length !== rawFields.length)", () => {
    expect(
      normalizeTaskFormPayload({
        form: {
          fields: [{ key: "a", label: "A" }, { label: "missing key" }],
        },
      }),
    ).toBeNull();
  });

  it("все валидные → парсится", () => {
    const result = normalizeTaskFormPayload({
      form: {
        fields: [
          { key: "a", label: "A" },
          { key: "b", label: "B" },
        ],
      },
    });
    expect(result?.form?.fields).toHaveLength(2);
  });
});

describe("normalizeTaskFormPayload — type aliases", () => {
  it("type='string' → 'text'", () => {
    const r = normalizeTaskFormPayload({
      form: { fields: [{ key: "x", type: "string", label: "X" }] },
    });
    expect(r?.form?.fields[0].type).toBe("text");
  });

  it("type='multiline' → 'textarea'", () => {
    const r = normalizeTaskFormPayload({
      form: { fields: [{ key: "x", type: "multiline", label: "X" }] },
    });
    expect(r?.form?.fields[0].type).toBe("textarea");
  });

  it("type='int' → 'number'", () => {
    const r = normalizeTaskFormPayload({
      form: { fields: [{ key: "x", type: "int", label: "X" }] },
    });
    expect(r?.form?.fields[0].type).toBe("number");
  });

  it("type='currency' → 'number'", () => {
    const r = normalizeTaskFormPayload({
      form: { fields: [{ key: "x", type: "currency", label: "X" }] },
    });
    expect(r?.form?.fields[0].type).toBe("number");
  });

  it("type='checkbox' с options → 'checkbox-group'", () => {
    const r = normalizeTaskFormPayload({
      form: {
        fields: [
          {
            key: "x",
            type: "checkbox",
            label: "X",
            options: ["a", "b"],
          },
        ],
      },
    });
    expect(r?.form?.fields[0].type).toBe("checkbox-group");
  });

  it("type='checkbox' без options → 'boolean'", () => {
    const r = normalizeTaskFormPayload({
      form: { fields: [{ key: "x", type: "checkbox", label: "X" }] },
    });
    expect(r?.form?.fields[0].type).toBe("boolean");
  });

  it("type unknown → возвращает as-is (graceful pass-through)", () => {
    const r = normalizeTaskFormPayload({
      form: { fields: [{ key: "x", type: "weird-custom-type", label: "X" }] },
    });
    expect(r?.form?.fields[0].type).toBe("weird-custom-type");
  });

  it("без type + options → 'select' (heuristic)", () => {
    const r = normalizeTaskFormPayload({
      form: { fields: [{ key: "x", label: "X", options: ["a", "b"] }] },
    });
    expect(r?.form?.fields[0].type).toBe("select");
  });

  it("без type + без options → 'text'", () => {
    const r = normalizeTaskFormPayload({
      form: { fields: [{ key: "x", label: "X" }] },
    });
    expect(r?.form?.fields[0].type).toBe("text");
  });
});

describe("normalizeTaskFormPayload — options normalization", () => {
  it("primitive options → {value, label} pair", () => {
    const r = normalizeTaskFormPayload({
      form: {
        fields: [{ key: "x", type: "select", options: ["one", 42, true] }],
      },
    });
    expect(r?.form?.fields[0].options).toEqual([
      { value: "one", label: "one" },
      { value: "42", label: "42" },
      { value: "true", label: "true" },
    ]);
  });

  it("object options с разными name-полями", () => {
    const r = normalizeTaskFormPayload({
      form: {
        fields: [
          {
            key: "x",
            type: "select",
            options: [
              { id: "a", name: "Apple" },
              { value: "b", label: "Banana" },
              { code: "c", title: "Cherry" },
            ],
          },
        ],
      },
    });
    expect(r?.form?.fields[0].options).toEqual([
      { value: "a", label: "Apple" },
      { value: "b", label: "Banana" },
      // code сохраняется как opt.code если present (третий option)
      { value: "c", label: "Cherry", code: "c" },
    ]);
  });

  it("invalid option (null/{}) — отфильтровывается", () => {
    const r = normalizeTaskFormPayload({
      form: {
        fields: [
          {
            key: "x",
            type: "select",
            options: [null, {}, "valid"],
          },
        ],
      },
    });
    expect(r?.form?.fields[0].options).toEqual([
      { value: "valid", label: "valid" },
    ]);
  });
});

describe("normalizeTaskFormPayload — number coercion", () => {
  it("maxLength=string '100' → 100", () => {
    const r = normalizeTaskFormPayload({
      form: {
        fields: [{ key: "x", type: "text", maxLength: "100" }],
      },
    });
    expect(r?.form?.fields[0].maxLength).toBe(100);
  });

  it("maxLength=null → undefined (не сохраняется)", () => {
    const r = normalizeTaskFormPayload({
      form: {
        fields: [{ key: "x", type: "text", maxLength: null }],
      },
    });
    expect(r?.form?.fields[0].maxLength).toBeUndefined();
  });

  it("maxLength=NaN-source → undefined", () => {
    const r = normalizeTaskFormPayload({
      form: {
        fields: [{ key: "x", type: "text", maxLength: "not a number" }],
      },
    });
    expect(r?.form?.fields[0].maxLength).toBeUndefined();
  });
});

describe("isTaskFormSchema type guard", () => {
  it("валидный payload → true", () => {
    expect(
      isTaskFormSchema({ fields: [{ key: "x", label: "X" }] }),
    ).toBe(true);
  });

  it("невалидный → false", () => {
    expect(isTaskFormSchema(null)).toBe(false);
    expect(isTaskFormSchema(42)).toBe(false);
    expect(isTaskFormSchema({})).toBe(false);
    expect(isTaskFormSchema({ fields: [] })).toBe(false);
  });
});
