import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { addMonths, INVOICE_VALID_DAYS, isPaidPlan, periodLabel } from "@shared/billing";
import { PLANS } from "@shared/plans";
import type { Party, SellerRequisites } from "./legal";
import { drawTable, PdfDocument } from "./pdf/pdf";
import { parseTrueType, type TrueTypeFont } from "./pdf/ttf";

/**
 * Счёт на оплату и УПД (статус 2): сборка из заказа — чистые функции, PDF —
 * из готового «черновика». Ни базы, ни сети: один и тот же снимок всегда
 * даёт тот же документ. Формы — как в HASSR (src/lib/invoices,
 * src/lib/closing-documents), рисует свой генератор (server/billing/pdf).
 */

const DAY = 24 * 60 * 60;

export type DocumentLine = {
  title: string;
  /** Условное обозначение и код по ОКЕИ: 876 — условная единица. */
  unit: string;
  unitCode: string;
  qty: number;
  priceRub: number;
  sumRub: number;
};

export type OrderForDocument = {
  id: number;
  plan: string;
  months: number;
  amountRub: number;
  createdAt: number;
  paidAt: number | null;
  planUntilAfter: number | null;
  promoCode: string | null;
  discountRub: number;
  invoiceDueAt: number | null;
  /** plan | topup; нет — plan. */
  orderKind?: string;
  promotionPercent?: number | null;
  promotionDiscountRub?: number;
  discountSource?: string | null;
  pointsRub?: number;
};

export type InvoiceDraft = {
  number: string;
  issuedAt: number;
  dueAt: number;
  seller: SellerRequisites;
  buyer: Party;
  lines: DocumentLine[];
  totalRub: number;
  basis: string;
  vatNote: string;
  site: string;
};

export type ClosingDraft = {
  number: string;
  issuedAt: number;
  seller: Party;
  buyer: Party;
  lines: DocumentLine[];
  totalRub: number;
  basis: string;
  paymentDocument: string;
  vatNote: string;
  site: string;
  supportEmail: string;
  voided: boolean;
};

// --- Форматы ------------------------------------------------------------------------

export function formatRuDate(sec: number): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(sec * 1000));
}

/** «1 990,00» — разряды неразрывным пробелом, всегда две цифры копеек. */
export function money(rub: number): string {
  const [int, frac] = Math.abs(rub).toFixed(2).split(".");
  return `${rub < 0 ? "−" : ""}${int.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${frac}`;
}

function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

const ONES = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

function triad(n: number, feminine: boolean): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  if (h) parts.push(HUNDREDS[h]);
  if (t === 1) parts.push(TEENS[o]);
  else {
    if (t) parts.push(TENS[t]);
    if (o) parts.push((feminine ? ONES_F : ONES)[o]);
  }
  return parts.join(" ");
}

export function numberToWords(n: number): string {
  if (n === 0) return "ноль";
  const groups: Array<{ forms: [string, string, string] | null; feminine: boolean }> = [
    { forms: null, feminine: false },
    { forms: ["тысяча", "тысячи", "тысяч"], feminine: true },
    { forms: ["миллион", "миллиона", "миллионов"], feminine: false },
    { forms: ["миллиард", "миллиарда", "миллиардов"], feminine: false },
  ];
  const parts: string[] = [];
  let rest = Math.floor(n);
  for (let i = 0; rest > 0 && i < groups.length; i++) {
    const chunk = rest % 1000;
    if (chunk) parts.unshift(groups[i].forms ? `${triad(chunk, groups[i].feminine)} ${plural(chunk, groups[i].forms!)}` : triad(chunk, false));
    rest = Math.floor(rest / 1000);
  }
  return parts.join(" ");
}

/** «Одна тысяча девятьсот девяносто рублей 00 копеек». */
export function amountInWords(value: number): string {
  const rub = Math.floor(value + 1e-9);
  const kop = Math.round((value - rub) * 100);
  const words = `${numberToWords(rub)} ${plural(rub, ["рубль", "рубля", "рублей"])} ${String(kop).padStart(2, "0")} ${plural(kop, ["копейка", "копейки", "копеек"])}`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// --- Сборка ---------------------------------------------------------------------------

const planTitle = (plan: string) => (isPaidPlan(plan) ? PLANS[plan].name : plan);
const isTopupOrder = (order: OrderForDocument) => order.orderKind === "topup";

/** Скидки и баллы — пояснением в строке: сумма строки — то, что оплачено деньгами. */
const promoNote = (order: OrderForDocument) => {
  const notes: string[] = [];
  if ((order.promotionDiscountRub ?? 0) > 0) {
    notes.push(`Скидка по акции${order.promotionPercent ? ` ${order.promotionPercent} %` : ""}: ${money(order.promotionDiscountRub!)} ₽.`);
  }
  if (order.discountRub > 0 && order.promoCode) {
    notes.push(
      order.discountSource === "lifetime"
        ? `Постоянная скидка (код ${order.promoCode}): ${money(order.discountRub)} ₽.`
        : `Скидка по промокоду ${order.promoCode}: ${money(order.discountRub)} ₽.`,
    );
  }
  if ((order.pointsRub ?? 0) > 0) notes.push(`Оплачено баллами баланса: ${money(order.pointsRub!)} ₽ — в сумму документа не входит.`);
  return notes.length ? ` ${notes.join(" ")}` : "";
};

/**
 * Счёт: услуга «с даты оплаты» — период начнётся, когда придут деньги,
 * поэтому в строке длительность, а не даты.
 */
export function buildInvoiceDraft(input: { order: OrderForDocument; seller: SellerRequisites; buyer: Party; site: string }): InvoiceDraft {
  const { order } = input;
  const total = Math.max(0, order.amountRub);
  return {
    number: String(order.id),
    issuedAt: order.createdAt,
    dueAt: order.invoiceDueAt ?? order.createdAt + INVOICE_VALID_DAYS * DAY,
    seller: input.seller,
    buyer: input.buyer,
    lines: [
      {
        title: isTopupOrder(order)
          ? "Пополнение баланса сервиса TasksFlow — предоплата за доступ к сервису (1 балл = 1 ₽)."
          : `Доступ к сервису TasksFlow, тариф «${planTitle(order.plan)}», ${periodLabel(order.months)} (срок — с даты оплаты).${promoNote(order)}`,
        unit: "усл. ед.",
        unitCode: "876",
        qty: 1,
        priceRub: total,
        sumRub: total,
      },
    ],
    totalRub: total,
    basis: `Договор-оферта (${input.site}/offer)`,
    vatNote: input.seller.vatNote,
    site: input.site,
  };
}

/**
 * УПД по оплаченному заказу: номер — номер заказа, дата — дата оплаты,
 * сумма — то, что пришло деньгами. Период — тот, что дала эта оплата.
 */
export function buildClosingDraft(input: {
  order: OrderForDocument;
  seller: SellerRequisites;
  buyer: Party;
  site: string;
}): ClosingDraft {
  const { order } = input;
  const paidAt = order.paidAt ?? order.createdAt;
  const date = formatRuDate(paidAt);
  const period = order.planUntilAfter
    ? `период ${formatRuDate(addMonths(order.planUntilAfter, -order.months))} — ${formatRuDate(order.planUntilAfter)}`
    : periodLabel(order.months);
  const total = Math.max(0, order.amountRub);
  const { vatNote, email, ...seller } = input.seller;
  return {
    number: String(order.id),
    issuedAt: paidAt,
    seller,
    buyer: input.buyer,
    lines: [
      {
        title: isTopupOrder(order)
          ? "Предоплата за доступ к сервису TasksFlow: пополнение баланса (1 балл = 1 ₽)."
          : `Доступ к сервису TasksFlow, тариф «${planTitle(order.plan)}», ${period}.${promoNote(order)}`,
        unit: "усл. ед.",
        unitCode: "876",
        qty: 1,
        priceRub: total,
        sumRub: total,
      },
    ],
    totalRub: total,
    basis: `Договор-оферта (${input.site}/offer), заказ № ${order.id} от ${date}`,
    paymentDocument: `№ ${order.id} от ${date}`,
    vatNote,
    site: input.site,
    supportEmail: email ?? "support@tasksflow.ru",
    voided: false,
  };
}

// --- PDF --------------------------------------------------------------------------------

const FONT_CANDIDATES = [
  path.join(process.cwd(), "server", "billing", "fonts", "DejaVuSans.ttf"),
  "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
];
let cachedFont: TrueTypeFont | null = null;

/** DejaVu Sans (лицензия рядом с файлом): у стандартных шрифтов PDF нет кириллицы. */
export function documentFont(): TrueTypeFont {
  if (cachedFont) return cachedFont;
  const file = FONT_CANDIDATES.find((candidate) => existsSync(candidate));
  if (!file) throw new Error("Нет шрифта для PDF: server/billing/fonts/DejaVuSans.ttf");
  cachedFont = parseTrueType(readFileSync(file));
  return cachedFont;
}

const innKpp = (p: Party) => [p.inn ? `ИНН ${p.inn}` : null, p.kpp ? `КПП ${p.kpp}` : null].filter(Boolean).join(", ");

/** «Счёт на оплату» — привычный бланк: банк получателя, стороны, строки, итог прописью, подписи. */
export function renderInvoicePdf(draft: InvoiceDraft): Buffer {
  const doc = new PdfDocument(documentFont(), { title: `Счёт на оплату № ${draft.number}` });
  const M = 15;
  const W = doc.pageW - M * 2;
  doc.setLineWidth(0.2).setStrokeGray(0).setFillGray(0);
  const bank = draft.seller.bank;

  // ---- банк получателя: левая часть 120 мм, «БИК / Сч. №» 16 мм, значения 44 мм.
  const a = 120;
  const b = 16;
  const c = W - a - b;
  const top = M;
  doc.rect(M, top, W, 30);
  doc.line(M + a, top, M + a, top + 30);
  doc.line(M + a + b, top, M + a + b, top + 30);
  doc.line(M, top + 12, M + a + b, top + 12);
  doc.line(M + a, top + 6, M + W, top + 6);
  doc.line(M, top + 18, M + a, top + 18);
  doc.line(M + a / 2, top + 12, M + a / 2, top + 18);
  doc.setFontSize(8.5);
  doc.lines(doc.wrap(bank.name, a - 3, 8.5).slice(0, 2), M + 1.5, top + 4);
  doc.text("Банк получателя", M + 1.5, top + 11, { size: 6.5 });
  doc.text("БИК", M + a + 1.5, top + 4.2);
  doc.text(bank.bik, M + a + b + 1.5, top + 4.2);
  doc.text("Сч. №", M + a + 1.5, top + 10);
  doc.text(bank.corrAccount, M + a + b + 1.5, top + 10);
  doc.text(`ИНН ${draft.seller.inn ?? ""}`, M + 1.5, top + 16);
  doc.text(draft.seller.kpp ? `КПП ${draft.seller.kpp}` : "КПП —", M + a / 2 + 1.5, top + 16);
  doc.text("Сч. №", M + a + 1.5, top + 16);
  doc.text(bank.account, M + a + b + 1.5, top + 16);
  doc.lines(doc.wrap(draft.seller.name, a - 3, 8.5).slice(0, 2), M + 1.5, top + 22);
  doc.text("Получатель", M + 1.5, top + 29, { size: 6.5 });

  // ---- заголовок
  let y = top + 42;
  doc.text(`Счёт на оплату № ${draft.number} от ${formatRuDate(draft.issuedAt)}`, M, y, { size: 13 });
  doc.setLineWidth(0.5).line(M, y + 2.5, M + W, y + 2.5).setLineWidth(0.2);
  y += 9;

  const party = (label: string, p: Party) => {
    const value = [p.name, innKpp(p), p.address].filter(Boolean).join(", ");
    doc.text(label, M, y, { size: 8.5 });
    y = doc.lines(doc.wrap(value, W - 45, 8.5), M + 45, y, { size: 8.5 }) + 1.5;
  };
  party("Поставщик (Исполнитель):", draft.seller);
  party("Покупатель (Заказчик):", draft.buyer);
  doc.text("Основание:", M, y, { size: 8.5 });
  doc.text(draft.basis, M + 45, y, { size: 8.5 });
  y += 5;

  // ---- строки
  y = drawTable(doc, {
    x: M,
    y,
    columns: [{ width: 9, align: "center" }, { width: 97 }, { width: 14, align: "right" }, { width: 18, align: "center" }, { width: 21, align: "right" }, { width: W - 159, align: "right" }],
    head: [["№", "Товары (работы, услуги)", "Кол-во", "Ед.", "Цена", "Сумма"]],
    body: draft.lines.map((line, i) => [String(i + 1), line.title, String(line.qty), line.unit, money(line.priceRub), money(line.sumRub)]),
    size: 8.5,
    padding: 1.4,
    headFill: 0.92,
    bottom: doc.pageH - 60,
    top: M,
  });

  y += 5;
  const right = M + W;
  doc.setFontSize(9);
  doc.text("Итого:", right - 32, y, { align: "right" }).text(money(draft.totalRub), right, y, { align: "right" });
  y += 4.6;
  doc.text("Без налога (НДС):", right - 32, y, { align: "right" }).text("—", right, y, { align: "right" });
  y += 4.6;
  doc.text("Всего к оплате:", right - 32, y, { align: "right" }).text(money(draft.totalRub), right, y, { align: "right" });
  y += 7;
  doc.text(`Всего наименований ${draft.lines.length}, на сумму ${money(draft.totalRub)} руб.`, M, y, { size: 8.5 });
  y += 4.6;
  y = doc.lines(doc.wrap(amountInWords(draft.totalRub), W, 9.5), M, y, { size: 9.5 }) + 3;

  doc.setFontSize(8);
  const notes = [
    `Оплатить не позднее ${formatRuDate(draft.dueAt)}. В назначении платежа укажите: «Оплата по счёту № ${draft.number} от ${formatRuDate(draft.issuedAt)}. ${draft.vatNote}».`,
    "Тариф включается после поступления денег на счёт. Закрывающий документ (УПД) появится в кабинете: «Тариф и оплата» → «Платежи».",
  ];
  for (const note of notes) y = doc.lines(doc.wrap(note, W, 8), M, y, { size: 8 }) + 1;
  doc.setLineWidth(0.5).line(M, y + 1, M + W, y + 1).setLineWidth(0.2);

  // ---- подписи
  y += 12;
  const head = draft.seller.head;
  doc.text(head?.post ?? "Руководитель", M, y, { size: 9 });
  doc.line(M + 62, y + 0.8, M + 112, y + 0.8);
  doc.text(head?.name ?? "", M + 116, y, { size: 9 });
  doc.text("(подпись)", M + 87, y + 4, { size: 6, align: "center" });

  doc.setFillGray(0.45).text(`Сформировано сервисом TasksFlow (${draft.site}).`, M, doc.pageH - 8, { size: 6.5 }).setFillGray(0);
  return doc.output();
}

/**
 * Универсальный передаточный документ, статус 2 (передаточный документ,
 * акт; счёт-фактура не составляется). Форма — приложение к письму ФНС от
 * 21.10.2013 № ММВ-20-3/96@. A4 альбомный: у таблицы пятнадцать граф.
 */
export function renderUpdPdf(draft: ClosingDraft): Buffer {
  const doc = new PdfDocument(documentFont(), { orientation: "landscape", title: `УПД № ${draft.number}` });
  const M = 10;
  const W = doc.pageW - M * 2;
  const date = formatRuDate(draft.issuedAt);
  doc.setLineWidth(0.2).setStrokeGray(0).setFillGray(0);

  // ---- статус и заголовок
  doc.rect(M, M, 35, 15);
  doc.text("Статус: 2", M + 2, M + 4.5, { size: 8 });
  doc.text("1 — счёт-фактура и передаточный", M + 2, M + 8, { size: 5.3 });
  doc.text("документ (акт)", M + 2, M + 10.4, { size: 5.3 });
  doc.text("2 — передаточный документ (акт)", M + 2, M + 12.8, { size: 5.3 });
  doc.text("УНИВЕРСАЛЬНЫЙ ПЕРЕДАТОЧНЫЙ ДОКУМЕНТ", doc.pageW / 2, M + 5, { align: "center", size: 11 });
  doc.text(`Передаточный документ (акт) № ${draft.number} от ${date}`, doc.pageW / 2, M + 11, { align: "center", size: 9.5 });
  doc.text(`Счёт-фактура не составляется (статус 2). ${draft.vatNote}.`, doc.pageW / 2, M + 15.5, { align: "center", size: 6.5 });
  if (draft.voided) {
    const label = "АННУЛИРОВАН — деньги возвращены";
    doc.setLineWidth(0.4).rect(doc.pageW - M - doc.textWidth(label, 8) - 4, M + 0.8, doc.textWidth(label, 8) + 3, 4.4).setLineWidth(0.2);
    doc.text(label, doc.pageW - M - 2.5, M + 4, { align: "right", size: 8 });
  }

  // ---- стороны
  const innKppLine = (p: Party) => {
    // У ИП нет КПП — показываем ОГРНИП, чтобы строка не была пустой.
    if (!p.kpp && (p.ogrn ?? "").length === 15) return `${p.inn ?? "—"} / ОГРНИП ${p.ogrn}`;
    return [p.inn ?? "—", p.kpp ?? ""].filter((v) => v.length > 0).join(" / ");
  };
  const rows: Array<[string, string]> = [
    ["Продавец (2)", draft.seller.name],
    ["Адрес (2а)", draft.seller.address ?? "—"],
    ["ИНН/КПП продавца (2б)", innKppLine(draft.seller)],
    ["Грузоотправитель и его адрес (3)", "он же"],
    ["Грузополучатель и его адрес (4)", [draft.buyer.name, draft.buyer.address].filter(Boolean).join(", ")],
    ["К платёжно-расчётному документу (5)", draft.paymentDocument],
    ["Покупатель (6)", draft.buyer.name],
    ["Адрес (6а)", draft.buyer.address ?? "—"],
    ["ИНН/КПП покупателя (6б)", innKppLine(draft.buyer)],
    ["Валюта: наименование, код (7)", "Российский рубль, 643"],
    ["Идентификатор госконтракта, договора (8)", "—"],
  ];
  let y = M + 21;
  const labelW = 66;
  const valueX = M + labelW + 2;
  const valueW = W - labelW - 2;
  for (const [label, value] of rows) {
    const wrapped = doc.wrap(value || "—", valueW, 7.5);
    doc.text(label, M, y, { size: 7.5 });
    const end = doc.lines(wrapped, valueX, y, { size: 7.5 });
    doc.setStrokeGray(0.6).line(valueX, end - 2.4, valueX + valueW, end - 2.4).setStrokeGray(0);
    y = end + 0.4;
  }

  // ---- таблица: 15 граф
  const head = [
    [
      "№ п/п",
      "Наименование товара (описание выполненных работ, оказанных услуг), имущественного права",
      "Код вида товара",
      "Ед. изм.: код",
      "усл. обозн.",
      "Количество (объём)",
      "Цена (тариф) за единицу",
      "Стоимость без налога — всего",
      "В т. ч. сумма акциза",
      "Налоговая ставка",
      "Сумма налога",
      "Стоимость с налогом — всего",
      "Страна: код",
      "краткое наименование",
      "Рег. номер декларации",
    ],
    ["А", "1", "1б", "2", "2а", "3", "4", "5", "6", "7", "8", "9", "10", "10а", "11"],
  ];
  const body = draft.lines.map((line, i) => [
    String(i + 1),
    line.title,
    "—",
    line.unitCode,
    line.unit,
    String(line.qty),
    money(line.priceRub),
    money(line.sumRub),
    "без акциза",
    "без НДС",
    "без НДС",
    money(line.sumRub),
    "—",
    "—",
    "—",
  ]);
  const foot = [["", "Всего к оплате (9)", "", "", "", "", "", money(draft.totalRub), "X", "", "без НДС", money(draft.totalRub), "", "", ""]];
  const widths = [8, 82, 12, 11, 13, 14, 18, 21, 14, 13, 14, 21, 11, 16, 9];
  y = drawTable(doc, {
    x: M,
    y: y + 1,
    columns: widths.map((width, i) => ({ width, align: i === 1 ? "left" : [5, 6, 7, 11].includes(i) ? "right" : "center" })),
    head,
    body,
    foot,
    size: 6.5,
    headSize: 6,
    padding: 1,
    headFill: 0.92,
    footFill: 0.96,
    bottom: doc.pageH - M - 6,
    top: M,
  });

  y += 4;
  if (y + 58 > doc.pageH - M - 6) {
    doc.addPage();
    y = M;
  }
  doc.text(`Всего к оплате: ${money(draft.totalRub)} руб. (${amountInWords(draft.totalRub)})`, M, y, { size: 7.5 });
  y += 5;
  doc.text(`Основание передачи (сдачи) / получения (приёмки) [8]: ${draft.basis}`, M, y, { size: 7 });
  y += 3.6;
  doc.text("Данные о транспортировке и грузе [9]: —", M, y, { size: 7 });
  y += 4.4;

  // ---- подписи: слева продавец, справа покупатель
  const colW = W / 2 - 3;
  const leftX = M;
  const rightX = M + W / 2 + 3;
  doc.line(M, y - 2, M + W, y - 2);
  const blockTop = y;

  const role = (x: number, yy: number, post: string, name: string) => {
    doc.text(post || "____________", x, yy, { size: 7 });
    doc.text("(должность)", x + 10, yy + 3, { size: 5.5 });
    const sx = x + 48;
    doc.line(sx, yy + 0.5, sx + 28, yy + 0.5);
    doc.text("(подпись)", sx + 14, yy + 3, { size: 5.5, align: "center" });
    doc.text(name || "____________", sx + 32, yy, { size: 7 });
    doc.text("(ф.и.о.)", sx + 40, yy + 3, { size: 5.5 });
  };

  const side = (x: number, title: string, p: Party, dateLine: string, otherLine: string, responsible: string, composer: string) => {
    let yy = blockTop + 2;
    doc.text(title, x, yy, { size: 7 });
    yy += 6;
    role(x, yy, p.head?.post ?? "", p.head?.name ?? "");
    yy += 6.5;
    doc.text(dateLine, x, yy, { size: 7 });
    yy += 3.6;
    doc.text(otherLine, x, yy, { size: 7 });
    yy += 5;
    doc.text(responsible, x, yy, { size: 7 });
    yy += 4.5;
    role(x, yy, p.head?.post ?? "", p.head?.name ?? "");
    yy += 6.5;
    const lines = doc.wrap(`${composer}: ${p.name}`, colW - 40, 6.5);
    doc.lines(lines, x, yy, { size: 6.5 });
    doc.text("М.П.", x + colW - 17, blockTop + 41, { size: 6, align: "center" });
    return yy + lines.length * 3;
  };
  const leftBottom = side(
    leftX,
    "Товар (груз) передал / услуги, результаты работ, права сдал",
    draft.seller,
    `Дата отгрузки, передачи (сдачи) [11]: ${date}`,
    "Иные сведения об отгрузке, передаче [12]: —",
    "Ответственный за правильность оформления факта хозяйственной жизни [13]:",
    "Наименование экономического субъекта — составителя документа [14]",
  );
  const rightBottom = side(
    rightX,
    "Товар (груз) получил / услуги, результаты работ, права принял",
    draft.buyer,
    "Дата получения (приёмки) [16]: «____» ______________ 20___ г.",
    "Иные сведения о получении, приёмке [17]: —",
    "Ответственный за правильность оформления факта хозяйственной жизни [18]:",
    "Наименование экономического субъекта — составителя документа [19]",
  );
  doc.line(doc.pageW / 2, blockTop - 2, doc.pageW / 2, Math.max(leftBottom, rightBottom, blockTop + 44));

  doc
    .setFillGray(0.45)
    .text(
      `Сформировано сервисом TasksFlow (${draft.site}) ${formatRuDate(Math.floor(Date.now() / 1000))}. Оригинал с подписью или обмен через ЭДО — по запросу на ${draft.supportEmail}.`,
      M,
      doc.pageH - 5,
      { size: 6 },
    )
    .setFillGray(0);
  return doc.output();
}

/** Имя файла: ASCII — для заголовка, кириллица — в filename*. */
export function documentFilename(kind: "invoice" | "upd", number: string): { ascii: string; utf8: string } {
  const safe = number.replace(/[^0-9A-Za-z_-]/g, "");
  return kind === "invoice" ? { ascii: `Invoice-${safe}.pdf`, utf8: `Счёт-${safe}.pdf` } : { ascii: `UPD-${safe}.pdf`, utf8: `УПД-${safe}.pdf` };
}
