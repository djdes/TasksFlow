import { describe, it, expect } from "vitest";
import { checklistCopyDraft } from "../client/src/components/DuplicateTaskDialog";
import { checklistPayload } from "../client/src/components/ChecklistEditor";

// «Дублировать» терял подзадачи: копия приходила без чек-листа.
describe("копия задачи забирает подзадачи", () => {
  const source = [
    { id: "a", title: "Стеллаж чистый", done: true, photoUrls: ["/uploads/x.jpg"], requiresPhoto: true },
    { id: "b", title: "Урны пустые", done: true, photoUrls: [], requiresPhoto: false },
    { id: "c", title: "  ", done: false, photoUrls: [] },
  ];

  it("тот же состав и «нужно фото», но без отметок, фото и со своими id", () => {
    const draft = checklistCopyDraft(source);
    expect(draft.map((d) => [d.title, d.requiresPhoto, d.done, d.photoUrls])).toEqual([
      ["Стеллаж чистый", true, false, []],
      ["Урны пустые", false, false, []],
    ]);
    expect(draft.some((d) => d.id === "a" || d.id === "b")).toBe(false);
    const payload = checklistPayload(draft)!;
    expect(payload.every((p) => !p.done && p.photoUrls.length === 0)).toBe(true);
  });

  it("без подзадач — пусто", () => {
    expect(checklistCopyDraft(null)).toEqual([]);
    expect(checklistPayload(checklistCopyDraft([]))).toBeNull();
  });
});
