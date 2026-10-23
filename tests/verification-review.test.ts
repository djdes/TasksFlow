/**
 * Экран «На проверке»: подбор фото, переход к следующей задаче после
 * решения и горячие клавиши (в том числе на русской раскладке).
 */
import { describe, it, expect } from "vitest";
import {
  collectTaskPhotos,
  getExamplePhotos,
  nextTaskIdAfter,
  reviewHotkey,
} from "../client/src/lib/verification-review";

describe("getExamplePhotos", () => {
  it("массив эталонов без повторов", () => {
    expect(getExamplePhotos({ examplePhotoUrls: ["/a.jpg", "/a.jpg", "/b.jpg"] })).toEqual(["/a.jpg", "/b.jpg"]);
  });
  it("старая задача — одиночный examplePhotoUrl", () => {
    expect(getExamplePhotos({ examplePhotoUrls: [], examplePhotoUrl: "/old.jpg" })).toEqual(["/old.jpg"]);
  });
  it("эталона нет — пустой список", () => {
    expect(getExamplePhotos({ examplePhotoUrls: null, examplePhotoUrl: null })).toEqual([]);
  });
});

describe("collectTaskPhotos", () => {
  it("общие фото, затем фото пунктов с их названием; повторы убраны", () => {
    expect(
      collectTaskPhotos({
        photoUrls: ["/1.jpg", "/2.jpg"],
        checklist: [
          { title: "Холодильник", photoUrls: ["/3.jpg", "/1.jpg"] },
          { title: "Пол", photoUrls: [] },
        ],
      }),
    ).toEqual([
      { url: "/1.jpg", label: "Фото 1" },
      { url: "/2.jpg", label: "Фото 2" },
      { url: "/3.jpg", label: "Холодильник" },
    ]);
  });
  it("legacy photoUrl используется, только когда массива нет", () => {
    expect(collectTaskPhotos({ photoUrl: "/legacy.jpg", photoUrls: [] })).toEqual([{ url: "/legacy.jpg", label: "Фото 1" }]);
    expect(collectTaskPhotos({ photoUrl: "/legacy.jpg", photoUrls: ["/new.jpg"] })).toEqual([{ url: "/new.jpg", label: "Фото 1" }]);
  });
  it("без фото — пусто", () => {
    expect(collectTaskPhotos({})).toEqual([]);
  });
});

describe("nextTaskIdAfter", () => {
  it("после решения — следующая задача", () => {
    expect(nextTaskIdAfter([1, 2, 3], 1)).toBe(2);
    expect(nextTaskIdAfter([1, 2, 3], 2)).toBe(3);
  });
  it("решили последнюю — предыдущая", () => {
    expect(nextTaskIdAfter([1, 2, 3], 3)).toBe(2);
  });
  it("очередь опустела — null", () => {
    expect(nextTaskIdAfter([5], 5)).toBeNull();
  });
  it("задачи уже нет в списке — первая оставшаяся", () => {
    expect(nextTaskIdAfter([4, 6], 9)).toBe(4);
  });
});

describe("reviewHotkey", () => {
  const body = { tagName: "BODY", closest: () => null };

  it("A/R по коду клавиши — и на русской раскладке", () => {
    expect(reviewHotkey({ key: "a", code: "KeyA", target: body })).toBe("approve");
    expect(reviewHotkey({ key: "ф", code: "KeyA", target: body })).toBe("approve");
    expect(reviewHotkey({ key: "r", code: "KeyR", target: body })).toBe("reject");
    expect(reviewHotkey({ key: "к", code: "KeyR", target: body })).toBe("reject");
  });
  it("стрелки листают очередь", () => {
    expect(reviewHotkey({ key: "ArrowLeft", target: body })).toBe("prev");
    expect(reviewHotkey({ key: "ArrowRight", target: body })).toBe("next");
  });
  it("не срабатывает при наборе текста и с модификаторами", () => {
    expect(reviewHotkey({ key: "a", code: "KeyA", target: { tagName: "TEXTAREA" } })).toBeNull();
    expect(reviewHotkey({ key: "r", code: "KeyR", target: { tagName: "INPUT" } })).toBeNull();
    expect(reviewHotkey({ key: "a", code: "KeyA", ctrlKey: true, target: body })).toBeNull();
    expect(reviewHotkey({ key: "r", code: "KeyR", metaKey: true, target: body })).toBeNull();
    expect(reviewHotkey({ key: "A", code: "KeyA", shiftKey: true, target: body })).toBeNull();
  });
  it("внутри открытого окна клавиши принадлежат окну", () => {
    const inDialog = { tagName: "BUTTON", closest: (s: string) => (s.includes("dialog") ? {} : null) };
    expect(reviewHotkey({ key: "ArrowRight", target: inDialog })).toBeNull();
    expect(reviewHotkey({ key: "a", code: "KeyA", target: inDialog })).toBeNull();
  });
  it("прочие клавиши игнорируются", () => {
    expect(reviewHotkey({ key: "x", code: "KeyX", target: body })).toBeNull();
    expect(reviewHotkey({ key: "Enter", code: "Enter", target: body })).toBeNull();
  });
});
