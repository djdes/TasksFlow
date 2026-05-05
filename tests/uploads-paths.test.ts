/**
 * Тесты resolveUploadAbs — конвертация frontend-URL'а фото в абсолютный
 * путь на диске. Раньше использовали path.resolve(cwd, photoUrl), что
 * на Linux/Windows игнорировало cwd когда photoUrl="/uploads/...":
 *   path.resolve("/var/www/X", "/uploads/foo") === "/uploads/foo"
 * Все unlink-операции тихо проваливались, /uploads/ распухал бесконечно
 * (см. server/uploads-paths.ts комментарий + тик 11).
 *
 * Если эти тесты падают — кто-то снёс basename-extraction или
 * поломал normalize'ацию слешей. На прод снова orphan-файлы.
 */

import { describe, it, expect } from "vitest";
import path from "path";
import { resolveUploadAbs, UPLOADS_ROOT } from "../server/uploads-paths";

describe("resolveUploadAbs — корректные URL'ы", () => {
  it("принимает /uploads/foo.jpg и возвращает абсолютный путь", () => {
    const abs = resolveUploadAbs("/uploads/foo.jpg");
    expect(abs).toBe(path.join(UPLOADS_ROOT, "foo.jpg"));
  });

  it("принимает foo.jpg (без префикса) и тоже возвращает абс. путь", () => {
    const abs = resolveUploadAbs("foo.jpg");
    expect(abs).toBe(path.join(UPLOADS_ROOT, "foo.jpg"));
  });

  it("принимает task-123-456.jpg (multer-style filename)", () => {
    const abs = resolveUploadAbs("task-123-456.jpg");
    expect(abs).toBe(path.join(UPLOADS_ROOT, "task-123-456.jpg"));
  });

  it("принимает /uploads/sub/foo.jpg — берёт только basename", () => {
    // multer пишет flat в uploads/, sub-папок не должно быть, но если
    // кто-то передаст /uploads/sub/foo.jpg — basename отрежет sub/ и
    // вернёт UPLOADS_ROOT/foo.jpg (не выйдет за uploads/).
    const abs = resolveUploadAbs("/uploads/sub/foo.jpg");
    expect(abs).toBe(path.join(UPLOADS_ROOT, "foo.jpg"));
  });
});

describe("resolveUploadAbs — невалидные/опасные входы", () => {
  it("null → null", () => {
    expect(resolveUploadAbs(null)).toBeNull();
  });

  it("undefined → null", () => {
    expect(resolveUploadAbs(undefined)).toBeNull();
  });

  it("пустая строка → null", () => {
    expect(resolveUploadAbs("")).toBeNull();
  });

  it("'.' (текущий dir) → null", () => {
    expect(resolveUploadAbs(".")).toBeNull();
  });

  it("'..' (родительский dir) → null", () => {
    expect(resolveUploadAbs("..")).toBeNull();
  });

  it("path-traversal '../../etc/passwd' → не выходит за uploads", () => {
    // basename('../../etc/passwd') === 'passwd'. Безопасно — попытается
    // удалить uploads/passwd которого нет (ENOENT silent). Главное не
    // выходить за UPLOADS_ROOT.
    const abs = resolveUploadAbs("../../etc/passwd");
    expect(abs).toBe(path.join(UPLOADS_ROOT, "passwd"));
    expect(abs!.startsWith(UPLOADS_ROOT + path.sep)).toBe(true);
  });

  it("'/etc/passwd' (абсолютный путь) — basename → 'passwd' внутри uploads", () => {
    const abs = resolveUploadAbs("/etc/passwd");
    expect(abs).toBe(path.join(UPLOADS_ROOT, "passwd"));
    expect(abs!.startsWith(UPLOADS_ROOT + path.sep)).toBe(true);
  });

  it("'C:\\Windows\\System32\\config\\SAM' (Windows) — basename только", () => {
    const abs = resolveUploadAbs("C:\\Windows\\System32\\config\\SAM");
    // basename вернёт "SAM" на Windows, на Linux — целую строку (нет
    // '/'). На Linux это всё равно single token и попадёт в uploads/X.
    expect(abs).not.toBeNull();
    expect(abs!.startsWith(UPLOADS_ROOT + path.sep)).toBe(true);
  });
});

describe("resolveUploadAbs — defense-in-depth", () => {
  it("результат всегда внутри UPLOADS_ROOT", () => {
    const inputs = [
      "/uploads/foo.jpg",
      "foo.jpg",
      "../../../etc/passwd",
      "/uploads/../../../secret",
      "C:\\Windows\\system32\\drivers\\etc\\hosts",
    ];
    for (const input of inputs) {
      const abs = resolveUploadAbs(input);
      if (abs) {
        expect(abs.startsWith(UPLOADS_ROOT + path.sep)).toBe(true);
      }
    }
  });
});
