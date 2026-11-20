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
import { jobDescriptionLabel, JOB_DESCRIPTION_MAX_CHARS, proposalScheduleLabel, sourceFromFileName, titleKey } from "../shared/job-description";
import { pdfToText, parseToUnicode } from "../server/job-description/pdf-text";
import { extractSegmentsJson, normalizeProposals, parseCreatedTasks } from "../server/job-description/proposals";
import fs from "node:fs";

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
    expect(sourceFromFileName("a.pdf")).toBe("pdf");
    expect(sourceFromFileName("a.png")).toBeNull();
  });
  it("подписи статуса", () => {
    expect(jobDescriptionLabel({ status: "done", tasksCreated: 7 })).toBe("Задач из инструкции: 7");
    expect(jobDescriptionLabel({ status: "done", tasksCreated: 0 })).toBe("Новых задач в инструкции нет");
    expect(jobDescriptionLabel({ status: "queued", tasksCreated: 0 }, false)).toBe("Инструкция ждёт диспетчера");
    expect(jobDescriptionLabel({ status: "review", tasksCreated: 0, proposalsCount: 8 })).toBe("Проверьте задачи: 8");
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

// ---- PDF ----

describe("pdfToText", () => {
  it("PDF из браузера: кириллица через ToUnicode, слова целиком, строки по порядку", () => {
    const text = pdfToText(fs.readFileSync("tests/fixtures/job-description-chromium.pdf"));
    expect(text.split("\n")).toEqual([
      "ДОЛЖНОСТНАЯ ИНСТРУКЦИЯ ПОВАРА",
      "1. Общие положения. Повар подчиняется заведующему производством.",
      "2. Должностные обязанности:",
      "Ежедневно проверять сроки годности продукции на витрине и в холодильниках.",
      "По пятницам мыть холодильник: полки, дверцу, уплотнитель.",
      "Следить, чтобы температура в холодильниках была 2–6 °C, записывать в журнал.",
      "Смена 08:00–20:00",
      "English line: Clean the grill №5 — 100%.",
    ]);
  });

  it("скан без текстового слоя — пустой текст (маршрут скажет «похоже, это скан»)", () => {
    expect(pdfToText(fs.readFileSync("tests/fixtures/job-description-scan.pdf"))).toBe("");
  });

  it("простой PDF без сжатия: литеральные строки, TJ с пробелом, T*", () => {
    const content = "BT /F1 12 Tf 10 700 Td (Wash the floor) Tj T* [(every) -300 (day)] TJ ET";
    const pdf = [
      "%PDF-1.4",
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
      "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
      "3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj",
      `4 0 obj << /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj`,
      "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
      "trailer << /Root 1 0 R >>",
      "%%EOF",
    ].join("\n");
    expect(pdfToText(Buffer.from(pdf, "latin1"))).toBe("Wash the floor\nevery day");
  });

  it("не PDF и защищённый PDF — понятные ошибки", () => {
    expect(() => pdfToText(Buffer.from("hello"))).toThrow(/Это не PDF/);
    expect(() => pdfToText(Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\ntrailer << /Encrypt 5 0 R /Root 1 0 R >>\n%%EOF", "latin1"))).toThrow(/паролем/);
  });

  it("ToUnicode: bfchar и bfrange, двухбайтовые коды", () => {
    const cmap = parseToUnicode("1 begincodespacerange <0000> <FFFF> endcodespacerange 2 beginbfchar <0003> <0020> <0010> <041F> endbfchar 1 beginbfrange <0020> <0022> <0430> endbfrange");
    expect(cmap.bytes).toBe(2);
    expect(cmap.map.get(0x10)).toBe("П");
    expect(cmap.map.get(0x22)).toBe("в");
  });
});

// ---- предложения задач ----

describe("normalizeProposals", () => {
  it("вопросы — только у регулярных, срок первой недели делает задачу разовой, дубли и лишнее — прочь", () => {
    const raw = extractSegmentsJson("Вот:\n```json\n" + JSON.stringify({ segments: [
      { id: "s1", title: "Проверить холодильники", isRecurring: true, checklist: ["Записать в журнал", { title: "Температура 2–6 °C?", options: ["Да", "Нет", "Да"] }, { title: "Один вариант?", options: ["Да"] }] },
      { id: "s2", title: "Пройти инструктаж", isRecurring: true, weekDays: [1], dueInDays: 40, checklist: [{ title: "Подпись?", options: ["Да", "Нет"] }] },
      { id: "s1", title: "проверить холодильники" },
      { title: "  " },
      { title: "Протирать столы", requiresPhoto: "нет", weekDays: [0, 1, 2, 3, 4, 5, 6], monthDay: 40 },
    ] }) + "\n```");
    expect(raw).not.toBeNull();
    const p = normalizeProposals(raw!.segments);
    expect(p.map((x) => x.title)).toEqual(["Проверить холодильники", "Пройти инструктаж", "Протирать столы"]);
    expect(p[0].checklist).toEqual([{ title: "Записать в журнал" }, { title: "Температура 2–6 °C?", options: ["Да", "Нет"] }, { title: "Один вариант?" }]);
    expect(p[1]).toMatchObject({ isRecurring: false, weekDays: null, dueInDays: 14, checklist: [{ title: "Подпись?" }] });
    expect(p[2]).toMatchObject({ requiresPhoto: false, isRecurring: true, weekDays: null, monthDay: null });
    expect(new Set(p.map((x) => x.id)).size).toBe(3);
  });

  it("не больше 12 предложений; список созданных — и новый формат, и старый", () => {
    expect(normalizeProposals(Array.from({ length: 20 }, (_, i) => ({ title: `Задача ${i}` })))).toHaveLength(12);
    expect(parseCreatedTasks("[5, {\"id\": 7, \"title\": \"Мыть пол\"}, {\"id\": \"x\"}]")).toEqual([{ id: 5, title: null }, { id: 7, title: "Мыть пол" }]);
  });

  it("расписание словами", () => {
    const base = { isRecurring: true, weekDays: null, monthDay: null, dueInDays: null };
    expect(proposalScheduleLabel(base)).toBe("Каждый день");
    expect(proposalScheduleLabel({ ...base, weekDays: [1, 2, 3, 4, 5] })).toBe("По будням");
    expect(proposalScheduleLabel({ ...base, weekDays: [5, 1] })).toBe("По пн, пт");
    expect(proposalScheduleLabel({ ...base, monthDay: 5 })).toBe("Каждое 5 число");
    expect(proposalScheduleLabel({ ...base, isRecurring: false, dueInDays: 3 })).toBe("Разово · за 3 дня");
    expect(titleKey("Помыть  ХОЛОДИЛЬНИК, ёлка!")).toBe("помыть холодильник елка");
  });
});

// ---- проверка перед созданием: ответ → предложения → «Создать выбранные» ----

let current: Record<string, unknown> | null = null;
vi.mock("../server/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => (current ? [{ ...current }] : []) }) }),
    update: () => ({ set: (set: Record<string, unknown>) => ({ where: async () => { if (current) Object.assign(current, set); } }) }),
    delete: () => ({ where: async () => { current = null; } }),
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
const removeTask = vi.fn();
vi.mock("../server/services/task-delete", () => ({ removeTask }));

describe("предложения и «Создать выбранные»", () => {
  const baseRow = () => ({
    userId: 7, companyId: 42, source: "text", fileName: null, content: "Повар\nМыть пол", status: "processing",
    gatewayJobId: "j1", attempts: 1, tasksCreated: 0, taskIds: null as string | null, proposals: null as string | null, autoApply: false,
    error: null, createdBy: 10, createdAt: 1, updatedAt: 1, sentAt: 1,
  });
  let workerTasks: Array<{ id: number; workerId: number; title: string; category?: string | null }>;
  beforeEach(() => {
    current = baseRow();
    createTaskForActor.mockReset();
    removeTask.mockReset();
    workerTasks = [{ id: 1, workerId: 7, title: "Помыть  ХОЛОДИЛЬНИК!" }, { id: 2, workerId: 8, title: "Мыть пол" }];
    storage.getUserById.mockImplementation(async (id: number) => ({ id, companyId: 42, name: id === 7 ? "Олег" : "Анна" }));
    storage.getCompanyById.mockResolvedValue({ id: 42, accessSettings: JSON.stringify({ taskBonus: 30 }) });
    storage.getTasks.mockImplementation(async () => workerTasks);
    let next = 100;
    createTaskForActor.mockImplementation(async ({ input }: { input: { title: string } }) => ({ id: next++, title: input.title }));
  });

  const answer = JSON.stringify({ segments: [
    { id: "a", title: "Мыть пол", isRecurring: true, checklist: ["зал", { title: "Пол сухой?", options: ["Да", "Нет"] }] },
    { id: "b", title: "Помыть холодильник", isRecurring: true, weekDays: [5] },
    { id: "c", title: "Пройти инструктаж", requiresPhoto: false, dueInDays: 2 },
  ] });

  it("ответ диспетчера — предложения на проверку, задачи пока не создаются", async () => {
    const { storeAnswer, getJobDescriptionDetails } = await import("../server/job-description/service");
    await storeAnswer(current as never, answer);
    expect(createTaskForActor).not.toHaveBeenCalled();
    expect(current).toMatchObject({ status: "review" });
    const details = await getJobDescriptionDetails(current as never);
    expect(details.state).toMatchObject({ status: "review", proposalsCount: 3 });
    expect(details.proposals.map((p) => [p.title, p.exists])).toEqual([["Мыть пол", false], ["Помыть холодильник", true], ["Пройти инструктаж", false]]);
  });

  it("создаются отмеченные, с поправленным названием, премией по умолчанию, вопросом и сроком первой недели", async () => {
    const { storeAnswer, applyJobDescription } = await import("../server/job-description/service");
    await storeAnswer(current as never, answer);
    const r = await applyJobDescription(current as never, { include: ["a", "b", "c"], titles: { a: "  Мыть пол в зале " } }, { kind: "session", userId: 10 });
    expect(r).toMatchObject({ created: 2, skipped: 1, removed: 0 });
    const [first, second] = createTaskForActor.mock.calls.map((c) => c[0]);
    expect(first.actor).toEqual({ kind: "session", userId: 10 });
    expect(first.input).toMatchObject({ title: "Мыть пол в зале", workerId: 7, price: 30, isRecurring: true, dueDate: null });
    expect(first.input.checklist[1]).toMatchObject({ title: "Пол сухой?", options: ["Да", "Нет"], requiresPhoto: false });
    expect(second.input).toMatchObject({ title: "Пройти инструктаж", isRecurring: false, requiresPhoto: false });
    const due = new Date(second.input.dueDate * 1000);
    const expected = new Date();
    expected.setDate(expected.getDate() + 2);
    expect(due.getDate()).toBe(expected.getDate());
    expect(current).toMatchObject({ status: "done", tasksCreated: 2 });
    expect(JSON.parse(String(current?.taskIds))).toEqual([{ id: 100, title: "Мыть пол в зале", proposal: "Мыть пол" }, { id: 101, title: "Пройти инструктаж" }]);
  });

  it("новая инструкция: предлагаем убрать задачи прошлой, которых в ней нет; чужие задачи не трогаем", async () => {
    workerTasks.push({ id: 50, workerId: 7, title: "Протирать витрину" }, { id: 51, workerId: 7, title: "Мыть пол" }, { id: 52, workerId: 7, title: "Своя задача руководителя" });
    current!.taskIds = JSON.stringify([{ id: 50, title: "Протирать витрину" }, { id: 51, title: "Мыть пол" }, { id: 99, title: "Удалённая" }]);
    const { storeAnswer, getJobDescriptionDetails, applyJobDescription } = await import("../server/job-description/service");
    await storeAnswer(current as never, answer);
    const details = await getJobDescriptionDetails(current as never);
    expect(details.stale).toEqual([{ taskId: 50, title: "Протирать витрину" }]);
    expect(details.created.map((c) => c.state)).toEqual(["active", "active", "deleted"]);
    await applyJobDescription(current as never, { include: [], remove: [50, 52, 1] }, { kind: "session", userId: 10 });
    expect(removeTask).toHaveBeenCalledTimes(1);
    expect(removeTask.mock.calls[0][0]).toMatchObject({ id: 50 });
    expect(JSON.parse(String(current?.taskIds))).toEqual([{ id: 51, title: "Мыть пол" }]);
  });

  it("название, поправленное при создании, — следующая инструкция узнаёт задачу по исходному", async () => {
    workerTasks.push({ id: 61, workerId: 7, title: "Протирать столы в зале" });
    current!.taskIds = JSON.stringify([{ id: 61, title: "Протирать столы в зале", proposal: "Мыть пол" }]);
    const { storeAnswer, getJobDescriptionDetails } = await import("../server/job-description/service");
    await storeAnswer(current as never, answer);
    const details = await getJobDescriptionDetails(current as never);
    expect(details.stale).toEqual([]);
    expect(details.proposals.find((p) => p.id === "a")?.exists).toBe(true);
  });

  it("переименованная задача прошлой инструкции — не «устаревшая» и не создаётся второй раз", async () => {
    workerTasks.push({ id: 60, workerId: 7, title: "Мыть пол в зале" });
    current!.taskIds = JSON.stringify([{ id: 60, title: "Мыть пол" }]);
    const { storeAnswer, getJobDescriptionDetails, applyJobDescription } = await import("../server/job-description/service");
    await storeAnswer(current as never, answer);
    const details = await getJobDescriptionDetails(current as never);
    expect(details.stale).toEqual([]);
    expect(details.proposals.find((p) => p.id === "a")?.exists).toBe(true);
    const r = await applyJobDescription(current as never, { include: ["a"] }, { kind: "session", userId: 10 });
    expect(r).toMatchObject({ created: 0, skipped: 1 });
  });

  it("«Создать сразу»: всё новое создаётся без проверки; пустой ответ — готово, 0 задач; мусор — ошибка", async () => {
    current!.autoApply = true;
    const { storeAnswer } = await import("../server/job-description/service");
    await storeAnswer(current as never, answer);
    expect(createTaskForActor).toHaveBeenCalledTimes(2);
    expect(current).toMatchObject({ status: "done", tasksCreated: 2 });
    current = baseRow();
    await storeAnswer(current as never, '{"segments": []}');
    expect(current).toMatchObject({ status: "done", tasksCreated: 0 });
    await storeAnswer(current as never, "Не могу помочь");
    expect(current).toMatchObject({ status: "failed" });
  });

  it("правки после создания видны: переименована и удалена", async () => {
    const { createdViews, describeGatewayFailure } = await import("../server/job-description/service");
    expect(createdViews([{ id: 1, title: "Мыть пол" }, { id: 2, title: "Протереть столы" }], [{ id: 1, title: "Мыть пол в зале" }])).toEqual([
      { taskId: 1, title: "Мыть пол", state: "edited", currentTitle: "Мыть пол в зале" },
      { taskId: 2, title: "Протереть столы", state: "deleted", currentTitle: null },
    ]);
    expect(describeGatewayFailure("dispatcher_timeout")).toMatch(/Ralph не взял/);
  });
});

describe("статистика для root", () => {
  it("чужой или пустой ответ не роняет страницу — пустая статистика", async () => {
    const { toFeedback } = await import("../client/src/components/RootJobDescriptionStats");
    expect(toFeedback([])).toMatchObject({ instructions: 0, bySource: {}, topDeleted: [] });
    expect(toFeedback(null).created).toBe(0);
    expect(toFeedback({ instructions: 3, bySource: { pdf: 2, bad: "x" }, topDeleted: [{ title: "Мыть пол", count: 2 }, 5] })).toMatchObject({
      instructions: 3, bySource: { pdf: 2 }, topDeleted: [{ title: "Мыть пол", count: 2 }],
    });
  });
});
