import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Шрифты раздаём сами (@fontsource): без Google Fonts IP посетителя не
// уходит третьей стороне. Тест ловит возврат внешних шрифтов и битые пути
// после обновления пакетов @fontsource.
const root = path.resolve(__dirname, "..");
const src = path.join(root, "client/src");

function faces(file: string) {
  const css = fs.readFileSync(path.join(src, file), "utf8");
  return [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => ({
    family: /font-family:\s*'([^']+)'/.exec(body)?.[1],
    weight: /font-weight:\s*(\d+)/.exec(body)?.[1],
    url: /src:\s*url\(([^)]+)\)/.exec(body)?.[1],
    display: /font-display:\s*(\w+)/.exec(body)?.[1],
    range: /unicode-range:\s*([^;]+);/.exec(body)?.[1],
  }));
}

function walk(dir: string, out: string[] = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(css|html|tsx?)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe("self-hosted шрифты", () => {
  it.each([
    ["fonts-public.css", ["Manrope", "Onest"]],
    ["fonts-cabinet.css", ["Inter", "Onest"]],
  ])("%s: файлы существуют, swap и unicode-range у каждого начертания", (file, families) => {
    const list = faces(file);
    expect(list.length).toBeGreaterThan(0);
    expect([...new Set(list.map((f) => f.family))].sort()).toEqual([...families].sort());
    for (const face of list) {
      expect(face.url, `${face.family} ${face.weight}`).toMatch(/\.woff2$/);
      expect(fs.existsSync(path.resolve(src, face.url!)), face.url).toBe(true);
      expect(face.display).toBe("swap");
      expect(face.range).toBeTruthy();
    }
  });

  it("кириллица есть у каждого семейства и веса", () => {
    for (const file of ["fonts-public.css", "fonts-cabinet.css"]) {
      const list = faces(file);
      const pairs = new Set(list.map((f) => `${f.family} ${f.weight}`));
      for (const pair of pairs) {
        const cyr = list.find((f) => `${f.family} ${f.weight}` === pair && f.url!.includes("-cyrillic-"));
        expect(cyr, `${file}: ${pair}`).toBeTruthy();
      }
    }
  });

  it("нигде не подключены Google Fonts", () => {
    const files = [path.join(root, "client/index.html"), path.join(root, "client/public.html"), ...walk(src)];
    const offenders = files.filter((f) => /fonts\.(googleapis|gstatic)\.com/.test(fs.readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });
});
