/**
 * Юридические документы публичной части: пути, подписи и форматирование.
 * Тексты лежат в content/legal/*.md и рендерятся на сервере
 * (server/public-data.ts). Модуль без серверных и браузерных зависимостей —
 * его импортируют роутер, подвал, страница документа и сервер.
 */
import type { LegalOperator, LegalSlug } from "./types";

export const DEFAULT_CONTACT_EMAIL = "support@tasksflow.ru";

export const LEGAL_DOCS: ReadonlyArray<{ slug: LegalSlug; path: string; label: string; short: string }> = [
  { slug: "privacy", path: "/privacy", label: "Политика обработки данных", short: "Политика" },
  { slug: "consent", path: "/consent", label: "Согласие на обработку данных", short: "Согласие" },
  { slug: "terms", path: "/terms", label: "Пользовательское соглашение", short: "Соглашение" },
  { slug: "offer", path: "/offer", label: "Публичная оферта", short: "Оферта" },
];

export const LEGAL_SLUGS: ReadonlySet<string> = new Set(LEGAL_DOCS.map((d) => d.slug));

/** id раздела про cookie в политике — на него ссылается уведомление о cookie. */
export const COOKIE_SECTION_ID = "cookie-i-analitika";

/**
 * Реквизиты оператора задаются в одном месте — env на сервере
 * (LEGAL_OPERATOR_NAME, _INN, _OGRN, _ADDRESS). Пока поле не задано, на
 * страницах виден этот плейсхолдер — заметный, а не выдуманное значение.
 */
export const OPERATOR_PLACEHOLDERS = {
  name: "[наименование оператора]",
  inn: "[ИНН]",
  ogrn: "[ОГРН/ОГРНИП]",
  address: "[юридический адрес]",
} as const;

export interface OperatorLine {
  label: string;
  value: string;
  /** true — поле не задано, выводится плейсхолдер. */
  placeholder: boolean;
  /** Переменная окружения, в которой задаётся значение. */
  env: string;
}

/** Строки карточки «Оператор и контакты». */
export function operatorLines(op: LegalOperator): OperatorLine[] {
  // 15 цифр — регистрационный номер ИП (ОГРНИП), 13 — юрлица (ОГРН).
  const ogrnLabel = op.ogrn?.replace(/\D/g, "").length === 15 ? "ОГРНИП" : "ОГРН";
  const line = (label: string, value: string | null, placeholder: string, env: string): OperatorLine => ({
    label,
    value: value || placeholder,
    placeholder: !value,
    env,
  });
  return [
    line("Оператор", op.name, OPERATOR_PLACEHOLDERS.name, "LEGAL_OPERATOR_NAME"),
    line("ИНН", op.inn, OPERATOR_PLACEHOLDERS.inn, "LEGAL_OPERATOR_INN"),
    line(ogrnLabel, op.ogrn, OPERATOR_PLACEHOLDERS.ogrn, "LEGAL_OPERATOR_OGRN"),
    line("Адрес", op.address, OPERATOR_PLACEHOLDERS.address, "LEGAL_OPERATOR_ADDRESS"),
  ];
}

const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/** «2026-10-23» → «23 октября 2026». Без Intl: одинаково на сервере и в браузере. */
export function formatLegalDate(iso: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return null;
  const month = MONTHS[Number(m[2]) - 1];
  if (!month) return null;
  return `${Number(m[3])} ${month} ${m[1]}`;
}
