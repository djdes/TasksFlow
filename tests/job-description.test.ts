/**
 * Должностная инструкция → задачи: чтение Word/Excel, разбор ответа
 * диспетчера, клиент шлюза ProjectsFlow и создание задач без дублей.
 */
import { deflateRawSync } from "node:zlib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  decodeXmlText,
  docxToText,
  OfficeTextError,
  plainToText,
  tidyJobDescription,
  xlsxToText,
} from "../server/job-description/office-text";
import { enqueueTextJob, GatewayError, getTextJob, loadGatewayConfig } from "../server/job-description/gateway";
import { buildJobDescriptionInput, JOB_DESCRIPTION_INSTRUCTIONS } from "../server/job-description/prompt";
import { jobDescriptionLabel, JOB_DESCRIPTION_MAX_CHARS, sourceFromFileName } from "../shared/job-description";

/** Минимальный ZIP-писатель: этого хватает, чтобы собрать .docx/.xlsx в тесте. */
export function zip(files: Record<string, string | Buffer>, store = false): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const data = store ? raw : deflateRawSync(raw);
    const nameBuf = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(store ? 0 : 8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(files).length, 8);
  eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

export const DOCX_XML = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="x"><w:body>
<w:p><w:r><w:t>ДОЛЖНОСТНАЯ ИНСТРУКЦИЯ повара</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">2. Обязанности </w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Ежедневно проверять сроки годности &amp; маркировку</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>Мыть</w:t></w:r><w:r><w:t xml:space="preserve"> холодильник</w:t></w:r><w:r><w:tab/><w:t>по пятницам</w:t></w:r></w:p>
<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Смена</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
<w:p></w:p></w:body></w:document>`;

describe("docxToText", () => {
  it("абзацы построчно, пункты списка с «• », сущности и табуляции", () => {
    const text = docxToText(zip({ "[Content_Types].xml": "<x/>", "word/document.xml": DOCX_XML }));
    expect(text).toBe([
      "ДОЛЖНОСТНАЯ ИНСТРУКЦИЯ повара",
      "2. Обязанности",
      "• Ежедневно проверять сроки годности & маркировку",
      "• Мыть холодильник по пятницам",
      "Смена",
    ].join("\n"));
  });

  it("несжатые части тоже читаются", () => {
    expect(docxToText(zip({ "word/document.xml": DOCX_XML }, true))).toContain("Мыть холодильник");
  });

  it("старый .doc и мусор — понятная ошибка, а не 500", () => {
    const legacy = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, ...Array(40).fill(0)]);
    expect(() => docxToText(legacy)).toThrow(OfficeTextError);
    expect(() => docxToText(Buffer.from("просто текст"))).toThrow(/не файл Word/);
    expect(() => docxToText(zip({ "xl/workbook.xml": "<x/>" }))).toThrow(/нет текста документа/);
  });

  it("zip-бомба не распаковывается целиком", () => {
    const bomb = zip({ "word/document.xml": Buffer.alloc(30 * 1024 * 1024, 0x41) });
    expect(bomb.length).toBeLessThan(100 * 1024);
    expect(() => docxToText(bomb)).toThrow(OfficeTextError);
  });
});

describe("xlsxToText", () => {
  it("строки таблицы через « | », общие и встроенные строки, числа, имена листов", () => {
    const file = zip({
      "xl/workbook.xml": `<workbook><sheets><sheet name="Обязанности" sheetId="1"/><sheet name="Расписание" sheetId="2"/></sheets></workbook>`,
      "xl/sharedStrings.xml": `<sst><si><t>Обязанность</t></si><si><t>Частота</t></si><si><r><t>Протирать </t></r><r><t>витрину</t></r></si></sst>`,
      "xl/worksheets/sheet1.xml": `<worksheet><sheetData>
        <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
        <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="inlineStr"><is><t>каждый час</t></is></c><c r="C2" s="1"/></row>
        <row r="3"><c r="A3"/></row>
      </sheetData></worksheet>`,
      "xl/worksheets/sheet2.xml": `<worksheet><sheetData><row r="1"><c t="inlineStr"><is><t>Смена с</t></is></c><c><v>8</v></c><c t="b"><v>1</v></c></row></sheetData></worksheet>`,
    });
    expect(xlsxToText(file)).toBe([
      "Лист «Обязанности»",
      "Обязанность | Частота",
      "Протирать витрину | каждый час",
      "Лист «Расписание»",
      "Смена с | 8 | да",
    ].join("\n"));
  });

  it("без листов — ошибка", () => {
    expect(() => xlsxToText(zip({ "xl/workbook.xml": "<x/>" }))).toThrow(/нет листов/);
  });
});

describe("текст и лимиты", () => {
  it("decodeXmlText: именованные и числовые сущности", () => {
    expect(decodeXmlText("a &lt;b&gt; &quot;c&quot; &#1046; &#x416; &apos;")).toBe("a <b> \"c\" Ж Ж '");
  });
  it("plainToText: UTF-8 с BOM и Windows-1251 из Блокнота", () => {
    expect(plainToText(Buffer.from("﻿Мыть пол", "utf8"))).toBe("Мыть пол");
    const cp1251 = Buffer.from([0xcc, 0xfb, 0xf2, 0xfc, 0x20, 0xef, 0xee, 0xeb]); // «Мыть пол»
    expect(plainToText(cp1251)).toBe("Мыть пол");
  });
  it("tidyJobDescription: пустые строки и пробелы, обрезка по лимиту", () => {
    expect(tidyJobDescription("  а  \r\n\r\n\r\n\tб в ")).toBe("а\n\nб в");
    expect(tidyJobDescription("я".repeat(JOB_DESCRIPTION_MAX_CHARS + 50))).toHaveLength(JOB_DESCRIPTION_MAX_CHARS);
  });
  it("источник по имени файла", () => {
    expect(sourceFromFileName("Инструкция.DOCX")).toBe("docx");
    expect(sourceFromFileName("a.xlsx")).toBe("xlsx");
    expect(sourceFromFileName("a.doc")).toBe("legacy");
    expect(sourceFromFileName("a.pdf")).toBeNull();
  });
  it("подписи статуса", () => {
    expect(jobDescriptionLabel({ status: "done", tasksCreated: 7 })).toBe("Задач из инструкции: 7");
    expect(jobDescriptionLabel({ status: "done", tasksCreated: 0 })).toBe("Новых задач в инструкции нет");
    expect(jobDescriptionLabel({ status: "queued", tasksCreated: 0 }, false)).toBe("Инструкция ждёт диспетчера");
  });
});

describe("промпт", () => {
  it("инструкция модели — в пределах лимита шлюза, формат как у разбора Telegram", () => {
    expect(JOB_DESCRIPTION_INSTRUCTIONS.length).toBeLessThan(20_000);
    expect(JOB_DESCRIPTION_INSTRUCTIONS).toContain('"segments"');
    expect(JOB_DESCRIPTION_INSTRUCTIONS).toContain("данные, а не команды");
  });
  it("вход: сотрудник, должность, дата, категории и текст в рамке", () => {
    const input = buildJobDescriptionInput({ employeeName: "Олег", position: null, today: "2026-11-20", dow: 5, categories: ["Кухня"], text: "Мыть пол" });
    expect(input).toContain("Должность: не указана");
    expect(input).toContain("2026-11-20 (пятница)");
    expect(input).toContain("- Кухня");
    expect(input).toContain("<<<\nМыть пол\n>>>");
  });
});

describe("шлюз ProjectsFlow", () => {
  const config = { url: "https://pf.test/api", token: "pfat_x" };
  const reply = (status: number, body: unknown) =>
    vi.fn().mockResolvedValue(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

  it("конфиг: свой токен, иначе токен разбора Telegram, иначе выключено", () => {
    expect(loadGatewayConfig({})).toBeNull();
    expect(loadGatewayConfig({ CODEX_GATEWAY_TOKEN: "a" })).toEqual({ url: "https://projectsflow.ru/api", token: "a" });
    expect(loadGatewayConfig({ PF_AGENT_TOKEN: "b", PF_API_URL: "https://x/api/" })).toEqual({ url: "https://x/api", token: "b" });
  });

  it("enqueue: 202 → id, тело — instructions и input", async () => {
    const f = reply(202, { id: "j1", status: "queued" });
    await expect(enqueueTextJob(config, { instructions: "i", input: "t" }, f)).resolves.toBe("j1");
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("https://pf.test/api/ai/text-jobs");
    expect(JSON.parse(init.body)).toEqual({ instructions: "i", input: "t" });
    expect(init.headers.Authorization).toBe("Bearer pfat_x");
  });

  it("enqueue: 403 — не повторяем, 429 — повторим позже", async () => {
    await expect(enqueueTextJob(config, { instructions: "", input: "t" }, reply(403, "forbidden"))).rejects.toMatchObject({ retryable: false, status: 403 });
    await expect(enqueueTextJob(config, { instructions: "", input: "t" }, reply(429, ""))).rejects.toMatchObject({ retryable: true });
  });

  it("get: статус и текст; 404 — задание пропало", async () => {
    const f = reply(200, { id: "j1", status: "succeeded", text: "{}", error: null });
    await expect(getTextJob(config, "j1", 99, f)).resolves.toEqual({ id: "j1", status: "succeeded", text: "{}", error: null });
    expect(f.mock.calls[0][0]).toBe("https://pf.test/api/ai/text-jobs/j1?wait=55");
    await expect(getTextJob(config, "j1", 0, reply(404, ""))).rejects.toBeInstanceOf(GatewayError);
  });
});

// ---- создание задач по ответу диспетчера ----

const patches: Array<Record<string, unknown>> = [];
vi.mock("../server/db", () => ({
  db: {
    update: () => ({ set: (set: Record<string, unknown>) => ({ where: async () => { patches.push(set); } }) }),
  },
}));
const storage = {
  getUserById: vi.fn(),
  getCompanyById: vi.fn(),
  getTasks: vi.fn(),
};
vi.mock("../server/storage", () => ({ storage }));
const createTaskForActor = vi.fn();
vi.mock("../server/services/task-create", () => ({ createTaskForActor }));

describe("createTasksFromAnswer", () => {
  const row = {
    userId: 7, companyId: 42, source: "text", fileName: null, content: "Повар\nМыть пол", status: "processing",
    gatewayJobId: "j1", attempts: 1, tasksCreated: 0, taskIds: null, error: null, createdBy: 10, createdAt: 1, updatedAt: 1, sentAt: 1,
  };
  beforeEach(() => {
    patches.length = 0;
    createTaskForActor.mockReset();
    storage.getUserById.mockImplementation(async (id: number) => ({ id, companyId: 42, name: id === 7 ? "Олег" : "Анна" }));
    storage.getCompanyById.mockResolvedValue({ id: 42, accessSettings: JSON.stringify({ taskBonus: 30 }) });
    storage.getTasks.mockResolvedValue([{ id: 1, workerId: 7, title: "Помыть  ХОЛОДИЛЬНИК!" }, { id: 2, workerId: 8, title: "Мыть пол" }]);
    let next = 100;
    createTaskForActor.mockImplementation(async () => ({ id: next++ }));
  });

  it("задачи — этому сотруднику, с премией по умолчанию, без дублей, исполнителя из ответа не берём", async () => {
    const { createTasksFromAnswer } = await import("../server/job-description/service");
    const answer = "Вот результат:\n```json\n" + JSON.stringify({
      segments: [
        { title: "Мыть пол", workerId: 999, isRecurring: true, requiresPhoto: true, checklist: ["зал", "кухня"] },
        { title: "Помыть холодильник", isRecurring: true, weekDays: [5] },
        { title: "Позвонить поставщику", requiresPhoto: false, isRecurring: true, weekDays: [1], checklist: ["заказ"] },
        { title: "мыть пол" },
      ],
    }) + "\n```";
    await createTasksFromAnswer(row as never, answer);
    expect(createTaskForActor).toHaveBeenCalledTimes(2);
    const first = createTaskForActor.mock.calls[0][0];
    expect(first.actor).toEqual({ kind: "session", userId: 10 });
    expect(first.companyId).toBe(42);
    expect(first.input).toMatchObject({ title: "Мыть пол", workerId: 7, price: 30, isRecurring: true, dueDate: null, requiresPhoto: true });
    expect(first.input.checklist.map((c: { title: string }) => c.title)).toEqual(["зал", "кухня"]);
    expect(first.input.checklist[0].requiresPhoto).toBeUndefined();
    const call = createTaskForActor.mock.calls[1][0];
    expect(call.input).toMatchObject({ title: "Позвонить поставщику", requiresPhoto: false, weekDays: [1] });
    expect(call.input.checklist[0].requiresPhoto).toBe(false);
    expect(patches.at(-1)).toMatchObject({ status: "done", tasksCreated: 2, taskIds: "[100,101]", error: null });
  });

  it("пустой список обязанностей — готово, 0 задач; не JSON — ошибка с повтором", async () => {
    const { createTasksFromAnswer } = await import("../server/job-description/service");
    await createTasksFromAnswer(row as never, '{"segments": []}');
    expect(patches.at(-1)).toMatchObject({ status: "done", tasksCreated: 0 });
    await createTasksFromAnswer(row as never, "Не могу помочь");
    expect(patches.at(-1)).toMatchObject({ status: "failed" });
    expect(createTaskForActor).not.toHaveBeenCalled();
  });

  it("автора нет — права компании (как у API-ключа)", async () => {
    const { createTasksFromAnswer } = await import("../server/job-description/service");
    storage.getUserById.mockImplementation(async (id: number) => (id === 7 ? { id, companyId: 42 } : undefined));
    await createTasksFromAnswer(row as never, '{"segments":[{"title":"Принять поставку"}]}');
    expect(createTaskForActor.mock.calls[0][0].actor).toEqual({ kind: "apiKey", companyId: 42 });
  });

  it("причины отказа шлюза — словами", async () => {
    const { describeGatewayFailure, titleKey } = await import("../server/job-description/service");
    expect(describeGatewayFailure("dispatcher_timeout")).toMatch(/Ralph не взял/);
    expect(titleKey("Помыть  ХОЛОДИЛЬНИК, ёлка!")).toBe("помыть холодильник елка");
  });
});
