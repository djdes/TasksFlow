/**
 * radix Checkbox — это <button>. Внутри <button>-строки он даёт бесконечный
 * цикл обновлений («Maximum update depth exceeded»): так падало окно
 * «Дублировать», раньше — создание задачи. Для строк выбора есть рисунок
 * CheckMark (components/ui/check-mark.tsx). Тест ловит возврат ошибки в
 * любом файле интерфейса.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "../client/src");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith(".tsx") ? [full] : [];
  });
}

/** Конец открывающего тега с позиции `from`: `>` вне {…} и кавычек. */
function tagEnd(source: string, from: number): { end: number; selfClosing: boolean } {
  let braces = 0;
  let quote: string | null = null;
  for (let i = from; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
    } else if (ch === "{") {
      braces++;
    } else if (ch === "}") {
      braces--;
    } else if (ch === ">" && braces === 0) {
      return { end: i, selfClosing: source[i - 1] === "/" };
    }
  }
  return { end: source.length, selfClosing: true };
}

/** Строки, где <Checkbox открыт внутри незакрытого <button>/<Button>. */
function checkboxesInsideButtons(raw: string): number[] {
  // Комментарии (в том числе {/* … */} в JSX) — не разметка; переводы строк сохраняем для номеров.
  const source = raw.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
  const found: number[] = [];
  let depth = 0;
  const tag = /<(\/?)(button|Button|Checkbox)(?=[\s/>])/g;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(source))) {
    const [, closing, name] = m;
    if (closing) {
      if (name !== "Checkbox") depth = Math.max(0, depth - 1);
      continue;
    }
    const { end, selfClosing } = tagEnd(source, m.index + m[0].length);
    if (name === "Checkbox") {
      if (depth > 0) found.push(source.slice(0, m.index).split("\n").length);
    } else if (!selfClosing) {
      depth++;
    }
    tag.lastIndex = end + 1;
  }
  return found;
}

describe("radix Checkbox не вкладывается в кнопку", () => {
  it("детектор видит вложение и не путает соседние элементы", () => {
    expect(checkboxesInsideButtons(`<button onClick={x}>\n<Checkbox checked />\n</button>`)).toEqual([2]);
    expect(checkboxesInsideButtons(`<label><Checkbox /></label><button>ok</button>`)).toEqual([]);
    expect(checkboxesInsideButtons(`<Button size="sm" /><Checkbox />`)).toEqual([]);
    expect(checkboxesInsideButtons(`{/* <button> в <button> */}\n<Checkbox />`)).toEqual([]);
    expect(checkboxesInsideButtons(`<Button onClick={() => go(a > b)} />\n<Checkbox />`)).toEqual([]);
    expect(checkboxesInsideButtons(`<button onClick={() => x}>\n<span>{a > b}</span>\n<Checkbox />\n</button>`)).toEqual([3]);
  });

  it("ни в одном файле client/src", () => {
    const offenders = tsxFiles(ROOT).flatMap((file) =>
      checkboxesInsideButtons(readFileSync(file, "utf8")).map((line) => `${path.relative(ROOT, file)}:${line}`),
    );
    expect(offenders).toEqual([]);
  });
});
