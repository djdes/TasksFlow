/**
 * Тесты formatTaskFormValue — confirm-summary форматирование.
 *
 * Воркер видит этот текст в финальном диалоге «Подтвердите данные»
 * перед отправкой в WeSetup-журнал. UX-критично: если кто сломает
 * форматирование, человек увидит «{"value":36.6}» вместо «36.6 °C»
 * и не поймёт что отправляет.
 */

import { describe, it, expect } from "vitest";
import { formatTaskFormValue } from "../client/src/lib/task-form-format";
import type { TaskFormField } from "../shared/wesetup-journal-mode";

const textField: TaskFormField = {
  type: "text",
  key: "comment",
  label: "Комментарий",
};

const numberField: TaskFormField = {
  type: "number",
  key: "temp",
  label: "Температура",
  unit: "°C",
};

const booleanField: TaskFormField = {
  type: "boolean",
  key: "done",
  label: "Сделано",
};

const selectField: TaskFormField = {
  type: "select",
  key: "status",
  label: "Статус",
  options: [
    { value: "ok", label: "В порядке", code: "OK" },
    { value: "issue", label: "Проблема" },
  ],
};

describe("formatTaskFormValue — пустые значения", () => {
  it("null → «—»", () => {
    expect(formatTaskFormValue(textField, null)).toBe("—");
  });
  it("undefined → «—»", () => {
    expect(formatTaskFormValue(textField, undefined)).toBe("—");
  });
  it("'' → «—»", () => {
    expect(formatTaskFormValue(textField, "")).toBe("—");
  });
  it("[] (пустой массив) → «—»", () => {
    expect(
      formatTaskFormValue({ ...selectField, type: "checkbox-group" }, []),
    ).toBe("—");
  });
});

describe("formatTaskFormValue — text", () => {
  it("text → as-is", () => {
    expect(formatTaskFormValue(textField, "Hello мир")).toBe("Hello мир");
  });
});

describe("formatTaskFormValue — boolean", () => {
  it("true → «Да»", () => {
    expect(formatTaskFormValue(booleanField, true)).toBe("Да");
  });
  it("false → «Нет»", () => {
    // false попадает в проверку value=='' (нет), null/undefined (нет),
    // потом в boolean switch case — НО! строка 656 проверяет value=== ""
    // не false. Так что false → попадёт в switch boolean → «Нет».
    expect(formatTaskFormValue(booleanField, false)).toBe("Нет");
  });
});

describe("formatTaskFormValue — number", () => {
  it("без unit → as-is", () => {
    expect(
      formatTaskFormValue({ ...numberField, unit: undefined }, 36.6),
    ).toBe("36.6");
  });
  it("c unit → «36.6 °C»", () => {
    expect(formatTaskFormValue(numberField, 36.6)).toBe("36.6 °C");
  });
  it("0 c unit → «0 °C» (НЕ «—»)", () => {
    // 0 не равно null/undefined/'', должно проходить дальше в switch.
    expect(formatTaskFormValue(numberField, 0)).toBe("0 °C");
  });
});

describe("formatTaskFormValue — select/radio", () => {
  it("known value → «code — label»", () => {
    expect(formatTaskFormValue(selectField, "ok")).toBe("OK — В порядке");
  });

  it("known value без code → просто label", () => {
    expect(formatTaskFormValue(selectField, "issue")).toBe("Проблема");
  });

  it("unknown value → as-is (fallback)", () => {
    expect(formatTaskFormValue(selectField, "missing")).toBe("missing");
  });

  it("radio тоже работает", () => {
    expect(formatTaskFormValue({ ...selectField, type: "radio" }, "ok")).toBe(
      "OK — В порядке",
    );
  });
});

describe("formatTaskFormValue — массив (multi-select)", () => {
  const multi: TaskFormField = {
    ...selectField,
    type: "checkbox-group",
  };

  it("несколько values → объединение через «, »", () => {
    expect(formatTaskFormValue(multi, ["ok", "issue"])).toBe(
      "OK — В порядке, Проблема",
    );
  });

  it("один value", () => {
    expect(formatTaskFormValue(multi, ["ok"])).toBe("OK — В порядке");
  });

  it("unknown values → as-is", () => {
    expect(formatTaskFormValue(multi, ["xxx", "yyy"])).toBe("xxx, yyy");
  });
});

describe("formatTaskFormValue — file/object value", () => {
  const fileField: TaskFormField = {
    type: "file",
    key: "doc",
    label: "Документ",
  };

  it("object с .name → имя файла", () => {
    expect(formatTaskFormValue(fileField, { name: "report.pdf" })).toBe(
      "report.pdf",
    );
  });

  it("object без .name → JSON.stringify", () => {
    expect(formatTaskFormValue(fileField, { url: "https://..." })).toBe(
      '{"url":"https://..."}',
    );
  });
});
