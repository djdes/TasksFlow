import { describe, it, expect } from "vitest";
import {
  extractAttachment,
  toggleFileTarget,
  setFileToAll,
  clearFileTargets,
  attachmentsForSegment,
  type DraftAttachment,
} from "../server/telegram/attachments";
import type { TgMessage } from "../server/telegram/client";

const baseMessage = (extra: Partial<TgMessage> = {}): TgMessage => ({
  message_id: 1,
  chat: { id: 100, type: "private" },
  date: 0,
  ...extra,
});

describe("extractAttachment", () => {
  it("из photo берёт САМЫЙ БОЛЬШОЙ размер (последний в массиве)", () => {
    const msg = baseMessage({
      photo: [
        { file_id: "small", file_unique_id: "a", width: 90, height: 90 },
        { file_id: "big", file_unique_id: "b", width: 1280, height: 1280 },
      ],
    });
    expect(extractAttachment(msg, 0)?.fileId).toBe("big");
  });

  it("photo по умолчанию уходит в первый сегмент", () => {
    const msg = baseMessage({
      photo: [{ file_id: "p", file_unique_id: "u", width: 1, height: 1 }],
    });
    expect(extractAttachment(msg, 0)?.targetSegmentIndexes).toEqual([0]);
  });

  it("document-картинка принимается с расширением по mime", () => {
    const msg = baseMessage({
      document: { file_id: "d", file_unique_id: "u", mime_type: "image/png" },
    });
    expect(extractAttachment(msg, 1)).toMatchObject({ key: 1, ext: ".png" });
  });

  it("document не-картинка отбрасывается", () => {
    const msg = baseMessage({
      document: { file_id: "d", file_unique_id: "u", mime_type: "application/pdf" },
    });
    expect(extractAttachment(msg, 0)).toBeNull();
  });

  it("SVG отбрасывается — это вектор XSS, а не фотоотчёт", () => {
    const msg = baseMessage({
      document: { file_id: "d", file_unique_id: "u", mime_type: "image/svg+xml" },
    });
    expect(extractAttachment(msg, 0)).toBeNull();
  });

  it("слишком большой документ отбрасывается до скачивания", () => {
    const msg = baseMessage({
      document: {
        file_id: "d",
        file_unique_id: "u",
        mime_type: "image/jpeg",
        file_size: 20 * 1024 * 1024,
      },
    });
    expect(extractAttachment(msg, 0)).toBeNull();
  });

  it("сообщение без вложений → null", () => {
    expect(extractAttachment(baseMessage({ text: "просто текст" }), 0)).toBeNull();
  });
});

describe("распределение файлов по задачам", () => {
  const file: DraftAttachment = {
    key: 0,
    fileId: "f",
    ext: ".jpg",
    targetSegmentIndexes: [0],
  };

  it("тогл добавляет и убирает сегмент", () => {
    const added = toggleFileTarget(file, 2);
    expect(added.targetSegmentIndexes).toEqual([0, 2]);
    expect(toggleFileTarget(added, 2).targetSegmentIndexes).toEqual([0]);
  });

  it("тогл держит индексы отсортированными", () => {
    const r = toggleFileTarget(toggleFileTarget(file, 5), 3);
    expect(r.targetSegmentIndexes).toEqual([0, 3, 5]);
  });

  it("«ко всем» проставляет все сегменты", () => {
    expect(setFileToAll(file, 3).targetSegmentIndexes).toEqual([0, 1, 2]);
  });

  it("«очистить» снимает все привязки", () => {
    expect(clearFileTargets(setFileToAll(file, 3)).targetSegmentIndexes).toEqual([]);
  });

  it("исходный объект не мутируется", () => {
    toggleFileTarget(file, 1);
    setFileToAll(file, 5);
    clearFileTargets(file);
    expect(file.targetSegmentIndexes).toEqual([0]);
  });

  it("attachmentsForSegment отбирает только назначенные", () => {
    const files: DraftAttachment[] = [
      { key: 0, fileId: "a", ext: ".jpg", targetSegmentIndexes: [0] },
      { key: 1, fileId: "b", ext: ".jpg", targetSegmentIndexes: [1, 2] },
      { key: 2, fileId: "c", ext: ".jpg", targetSegmentIndexes: [] },
    ];
    expect(attachmentsForSegment(files, 0).map((f) => f.fileId)).toEqual(["a"]);
    expect(attachmentsForSegment(files, 1).map((f) => f.fileId)).toEqual(["b"]);
    expect(attachmentsForSegment(files, 3)).toEqual([]);
  });
});

describe("альбом: ключи вложений", () => {
  it("каждому кадру свой key — он же индекс в callback_data", () => {
    const msgs = ["a", "b", "c"].map((id) =>
      baseMessage({ photo: [{ file_id: id, file_unique_id: id, width: 1, height: 1 }] }),
    );
    const attachments: DraftAttachment[] = [];
    for (const m of msgs) {
      const a = extractAttachment(m, attachments.length);
      if (a) attachments.push(a);
    }
    expect(attachments.map((a) => a.key)).toEqual([0, 1, 2]);
    expect(attachments.map((a) => a.fileId)).toEqual(["a", "b", "c"]);
  });
});
