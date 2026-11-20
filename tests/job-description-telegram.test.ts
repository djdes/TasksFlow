/**
 * Должностная инструкция через Telegram-бота: файл → «чья это?» → разбор,
 * и ссылка на проверку, когда задачи готовы.
 */
import { deflateRawSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = {
  getAllUsers: vi.fn(),
  getUserById: vi.fn(),
  findUserByTelegramUserId: vi.fn(),
};
vi.mock("../server/storage", () => ({ storage }));
const access = { accessOf: vi.fn(), roleOf: vi.fn(async () => null) };
vi.mock("../server/access", () => access);
const service = {
  saveJobDescription: vi.fn(async () => ({})),
  runJobDescription: vi.fn(async () => {}),
  isGatewayConfigured: vi.fn(() => true),
};
vi.mock("../server/job-description/service", () => service);
const runtimeHolder: { runtime: unknown } = { runtime: null };
vi.mock("../server/telegram/index", () => ({ getTelegramRuntime: () => runtimeHolder.runtime }));

function docx(text: string): Buffer {
  const raw = Buffer.from(`<w:document><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`, "utf8");
  const data = deflateRawSync(raw);
  const name = Buffer.from("word/document.xml");
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt16LE(name.length, 28);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10); eocd.writeUInt32LE(46 + name.length, 12); eocd.writeUInt32LE(30 + name.length + data.length, 16);
  return Buffer.concat([local, name, data, central, name, eocd]);
}

const ADMIN = { id: 1, name: "Денис", isAdmin: true, companyId: 42, tgChatId: 555, tgStartedAt: 1 };
const OLEG = { id: 7, name: "Олег Поваров", isAdmin: false, companyId: 42, phone: "+7999" };
const ANNA = { id: 8, name: "Анна", isAdmin: false, companyId: 42, phone: "+7998" };
const WORKER = { id: 9, name: "Игорь", isAdmin: false, companyId: 42 };

function makeRuntime(file: Buffer) {
  const client = {
    getFile: vi.fn(async () => ({ file_path: "docs/file.docx" })),
    downloadFile: vi.fn(async () => file),
    sendMessage: vi.fn(async () => ({ message_id: 77 })),
    editMessageText: vi.fn(async () => ({})),
    answerCallbackQuery: vi.fn(async () => ({})),
  };
  return { client } as never as { client: typeof client };
}
const message = (caption = "", name = "Инструкция.docx") => ({
  message_id: 10,
  chat: { id: 555 },
  caption,
  document: { file_id: "f1", file_unique_id: "u1", file_name: name, file_size: 1000 },
});

beforeEach(() => {
  vi.clearAllMocks();
  storage.getAllUsers.mockResolvedValue([ADMIN, OLEG, ANNA]);
  storage.getUserById.mockImplementation(async (id: number) => [ADMIN, OLEG, ANNA, WORKER].find((u) => u.id === id));
  storage.findUserByTelegramUserId.mockResolvedValue(ADMIN);
  access.accessOf.mockResolvedValue({ manageUsers: false });
});

describe("файл инструкции в боте", () => {
  it("только Word, Excel и PDF; картинки — это фотоотчёты", async () => {
    const { isJobDescriptionDocument } = await import("../server/telegram/job-description");
    expect(isJobDescriptionDocument(message("", "a.docx") as never)).toBe(true);
    expect(isJobDescriptionDocument(message("", "a.pdf") as never)).toBe(true);
    expect(isJobDescriptionDocument(message("", "a.doc") as never)).toBe(true);
    expect(isJobDescriptionDocument(message("", "photo.jpg") as never)).toBe(false);
  });

  it("имя в подписи — сразу на разбор, без вопроса", async () => {
    const { handleJobDescriptionDocument } = await import("../server/telegram/job-description");
    const runtime = makeRuntime(docx("Ежедневно проверять сроки годности на витрине"));
    expect(await handleJobDescriptionDocument(message("Инструкция для Олега") as never, ADMIN as never, runtime as never)).toBe(true);
    expect(service.saveJobDescription).toHaveBeenCalledWith(expect.objectContaining({ userId: 7, companyId: 42, createdBy: 1, source: "docx", content: "Ежедневно проверять сроки годности на витрине" }));
    expect(service.runJobDescription).toHaveBeenCalledWith(7);
    expect(runtime.client.editMessageText.mock.calls[0][0].text).toMatch(/Олег Поваров.*принята/);
  });

  it("без имени — кнопки с людьми; нажатие отправляет на разбор, «Отмена» — нет", async () => {
    const { handleJobDescriptionDocument, handleJobDescriptionCallback } = await import("../server/telegram/job-description");
    const runtime = makeRuntime(docx("Ежедневно проверять сроки годности на витрине"));
    await handleJobDescriptionDocument(message() as never, ADMIN as never, runtime as never);
    const kb = runtime.client.sendMessage.mock.calls[0][0].reply_markup.inline_keyboard.flat();
    expect(kb.map((b: { text: string }) => b.text)).toEqual(["Анна", "Денис", "Олег Поваров", "Отмена"]);
    const oleg = kb.find((b: { text: string }) => b.text === "Олег Поваров").callback_data;
    expect(oleg).toMatch(/^jd:[a-f0-9]{8}:7$/);
    expect(await handleJobDescriptionCallback({ id: "q", from: { id: 1 }, data: oleg, message: { message_id: 77, chat: { id: 555 } } } as never, runtime as never)).toBe(true);
    expect(service.saveJobDescription).toHaveBeenCalledWith(expect.objectContaining({ userId: 7 }));
    // Второе нажатие той же кнопки — уже устарела.
    await handleJobDescriptionCallback({ id: "q2", from: { id: 1 }, data: oleg, message: { message_id: 77, chat: { id: 555 } } } as never, runtime as never);
    expect(runtime.client.answerCallbackQuery.mock.calls.at(-1)[0].text).toMatch(/устарела/);

    await handleJobDescriptionDocument(message() as never, ADMIN as never, runtime as never);
    const cancel = runtime.client.sendMessage.mock.calls.at(-1)[0].reply_markup.inline_keyboard.flat().at(-1).callback_data;
    await handleJobDescriptionCallback({ id: "q3", from: { id: 1 }, data: cancel, message: { message_id: 78, chat: { id: 555 } } } as never, runtime as never);
    expect(service.saveJobDescription).toHaveBeenCalledTimes(1);
  });

  it("чужая кнопка, сотрудник без прав и битый файл", async () => {
    const { handleJobDescriptionDocument, handleJobDescriptionCallback } = await import("../server/telegram/job-description");
    const runtime = makeRuntime(docx("Ежедневно проверять сроки годности на витрине"));
    await handleJobDescriptionDocument(message() as never, ADMIN as never, runtime as never);
    const btn = runtime.client.sendMessage.mock.calls[0][0].reply_markup.inline_keyboard[0][0].callback_data;
    storage.findUserByTelegramUserId.mockResolvedValueOnce(ANNA);
    await handleJobDescriptionCallback({ id: "q", from: { id: 2 }, data: btn, message: { message_id: 77, chat: { id: 555 } } } as never, runtime as never);
    expect(service.saveJobDescription).not.toHaveBeenCalled();

    expect(await handleJobDescriptionDocument(message() as never, WORKER as never, runtime as never)).toBe(false);

    const bad = makeRuntime(Buffer.from("not a zip"));
    await handleJobDescriptionDocument(message() as never, ADMIN as never, bad as never);
    expect(bad.client.sendMessage.mock.calls[0][0].text).toMatch(/не файл Word/);
  });

  it("имя из подписи — только однозначное", async () => {
    const { matchByCaption } = await import("../server/telegram/job-description");
    const people = [{ id: 7, name: "Олег Поваров" }, { id: 8, name: "Анна" }, { id: 9, name: "Анна Кассирова" }];
    expect(matchByCaption("инструкция Олегу", people)).toBe(7);
    expect(matchByCaption("для Анны", people)).toBeNull();
    expect(matchByCaption("", people)).toBeNull();
  });

  it("задачи готовы — автору ссылка «Проверить задачи», если Telegram привязан", async () => {
    const { notifyJobDescriptionReady } = await import("../server/telegram/job-description");
    const runtime = makeRuntime(Buffer.alloc(0));
    runtimeHolder.runtime = runtime;
    await notifyJobDescriptionReady({ userId: 7, createdBy: 1 }, 6);
    const sent = runtime.client.sendMessage.mock.calls[0][0];
    expect(sent.chat_id).toBe(555);
    expect(sent.text).toMatch(/Олег Поваров.*готовы: 6/);
    expect(sent.reply_markup.inline_keyboard[0][0].url).toMatch(/\/admin\/users\?review=7$/);
    await notifyJobDescriptionReady({ userId: 7, createdBy: 8 }, 6);
    expect(runtime.client.sendMessage).toHaveBeenCalledTimes(1);
    runtimeHolder.runtime = null;
  });
});
