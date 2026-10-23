/**
 * Подготовка фото и очередь без сети: размеры, подпись времени, что
 * повторять, а что выбрасывать.
 */
import { describe, expect, it } from "vitest";
import { fitWithin, jpegName, stampText } from "../client/src/lib/photo-prep";
import { classifyStatus } from "../client/src/lib/upload-queue";
import { DEFAULT_PHOTO_SETTINGS, parsePhotoSettings } from "../shared/photo-settings";

describe("размер фото", () => {
  it("большое вписывается в 1600 по длинной стороне с сохранением пропорций", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: 1600 });
  });
  it("маленькое не увеличивается, пустое — ноль", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(0, 600)).toEqual({ width: 0, height: 0 });
  });
});

describe("подпись и имя", () => {
  it("дата и время по часам телефона, с местом через точку", () => {
    const d = new Date(2026, 9, 24, 9, 5);
    expect(stampText(d)).toBe("24.10.2026 09:05");
    expect(stampText(d, "Кафе «Ромашка»")).toBe("24.10.2026 09:05 · Кафе «Ромашка»");
  });
  it("расширение меняется на .jpg", () => {
    expect(jpegName("IMG_0001.HEIC")).toBe("IMG_0001.jpg");
    expect(jpegName("photo")).toBe("photo.jpg");
    expect(jpegName(".png")).toBe("photo.jpg");
  });
});

describe("очередь без сети", () => {
  it("повторяем при обрыве и ошибках сервера, выбрасываем при отказе по существу", () => {
    expect(classifyStatus(200)).toBe("ok");
    expect(classifyStatus(0)).toBe("retry");
    expect(classifyStatus(502)).toBe("retry");
    expect(classifyStatus(429)).toBe("retry");
    expect(classifyStatus(400)).toBe("drop"); // уже 10 фото
    expect(classifyStatus(403)).toBe("drop");
    expect(classifyStatus(404)).toBe("drop"); // задачу удалили
  });
});

describe("настройки фото компании", () => {
  it("по умолчанию — время на фото, камера с галереей", () => {
    expect(parsePhotoSettings(null)).toEqual(DEFAULT_PHOTO_SETTINGS);
    expect(DEFAULT_PHOTO_SETTINGS).toEqual({ stamp: true, cameraOnly: false });
    expect(parsePhotoSettings('{"stamp":false,"cameraOnly":true}')).toEqual({ stamp: false, cameraOnly: true });
    expect(parsePhotoSettings("{oops")).toEqual(DEFAULT_PHOTO_SETTINGS);
  });
});
