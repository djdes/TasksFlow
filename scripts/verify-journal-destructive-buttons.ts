import fs from "node:fs/promises";
import path from "node:path";
import { chromium, type BrowserContext, type Page, type APIRequestContext, type Locator } from "playwright";

const BASE = process.env.EXTERNAL_API_BASE?.replace(/\/$/, "") || "https://wesetup.ru";
const EMAIL = process.env.EXTERNAL_VERIFY_EMAIL || "admin@haccp.local";
const PASSWORD = process.env.EXTERNAL_VERIFY_PASSWORD || "admin1234";
const ORG_ID = process.env.EXTERNAL_API_ORG_ID || "cmnm40ikt00002ktseet6fd5y";
const TOKEN_FILE =
  process.env.EXTERNAL_API_TOKEN_FILE || ".agent/tasks/journals-external-api/.external-token.secret";
const CODES_FILE = ".agent/tasks/journals-external-api/prod-journal-codes.txt";
const OUT_DIR = ".agent/tasks/journals-destructive-buttons-verify";
const REQUESTED_CODES = (process.env.EXTERNAL_VERIFY_CODES || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const RUN_YEAR_BASE = new Date().getUTCFullYear() - 2 - (Math.floor(Date.now() / 60000) % 3);
const CONFIG_CODES = new Set([
  "accident_journal",
  "audit_plan",
  "audit_protocol",
  "audit_report",
  "breakdown_history",
  "complaint_register",
  "disinfectant_usage",
  "equipment_calibration",
  "equipment_maintenance",
  "finished_product",
  "glass_items_list",
  "incoming_control",
  "incoming_raw_materials_control",
  "intensive_cooling",
  "metal_impurity",
  "perishable_rejection",
  "ppe_issuance",
  "product_writeoff",
  "sanitary_day_control",
  "staff_training",
  "traceability_test",
  "training_plan",
]);
const GENERIC_ENTRY_CODES = new Set([
  "cleaning",
  "cleaning_ventilation_checklist",
  "climate_control",
  "cold_equipment_control",
  "equipment_cleaning",
  "fryer_oil",
  "general_cleaning",
  "glass_control",
  "health_check",
  "hygiene",
  "med_books",
]);
const CLOSE_BUTTON_PATTERNS = [
  /^\u0417\u0430\u043a\u043e\u043d\u0447\u0438\u0442\u044c \u0436\u0443\u0440\u043d\u0430\u043b$/i,
  /^\u0417\u0430\u043a\u0440\u044b\u0442\u044c \u0436\u0443\u0440\u043d\u0430\u043b$/i,
  /^\u0417\u0430\u043a\u043e\u043d\u0447\u0438\u0442\u044c$/i,
  /^\u0417\u0430\u043a\u0440\u044b\u0442\u044c$/i,
];
const CLOSE_CONFIRM_PATTERN =
  /^\u0417\u0430\u043a\u043e\u043d\u0447\u0438\u0442\u044c|^\u0417\u0430\u043a\u0440\u044b\u0442\u044c|^\u041e\u0442\u043f\u0440\u0430\u0432\u0438\u0442\u044c \u0432 \u0437\u0430\u043a\u0440\u044b\u0442\u044b\u0435/i;
const CLOSE_LIST_KEYWORDS = [
  "\u0437\u0430\u043a\u0440\u044b\u0442",
  "\u0430\u0440\u0445\u0438\u0432",
  "\u0437\u0430\u043a\u043e\u043d\u0447",
];

type CreateResult = {
  id: string;
  title: string;
  dateFrom: string;
  dateTo: string;
  seedDate: string;
  marker: string;
};

type DeleteResult = {
  status: "PASS" | "FAIL";
  detail: string;
  strategy: string;
  saveUsed: boolean;
};

type DeleteHints = {
  marker: string;
  seedDate: string;
  seedTimeTexts?: string[];
};

type CloseResult = {
  status: "PASS" | "FAIL";
  detail: string;
};

type CodeResult = {
  code: string;
  documentId: string;
  title: string;
  createStatus: number;
  seedStatus: number;
  seedDocumentMatched: boolean;
  deleteResult: DeleteResult;
  closeResult: CloseResult;
  verdict: "PASS" | "FAIL";
};

function markerFor(code: string) {
  return `DEL-CLOSE ${code.replaceAll("_", "-")} ${Date.now().toString(36).toUpperCase()}`;
}

function monthWindow(index: number) {
  const year = RUN_YEAR_BASE + Math.floor(index / 12);
  const month = (index % 12) + 1;
  const pad = (value: number) => String(value).padStart(2, "0");
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    dateFrom: `${year}-${pad(month)}-01`,
    dateTo: `${year}-${pad(month)}-${pad(lastDay)}`,
    seedDate: `${year}-${pad(month)}-15`,
  };
}

function normalizeJson(value: unknown) {
  return JSON.stringify(value ?? null);
}

function bodyHash(document: Record<string, unknown>) {
  return normalizeJson({
    config: document.config ?? null,
    entries: document.entries ?? null,
    status: document.status ?? null,
    title: document.title ?? null,
  });
}

async function readCodes() {
  return (await fs.readFile(CODES_FILE, "utf8"))
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

async function readToken() {
  return (await fs.readFile(TOKEN_FILE, "utf8")).trim();
}

async function login() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 2400 } });
  const page = await context.newPage();
  const response = await context.request.post(new URL("/api/auth/login", BASE).toString(), {
    data: { email: EMAIL, password: PASSWORD },
  });
  if (!response.ok()) {
    throw new Error(`login failed: ${response.status()}`);
  }
  return { browser, context, page };
}

async function apiJson<T>(response: Awaited<ReturnType<APIRequestContext["get"]>>) {
  return (await response.json().catch(() => null)) as T;
}

async function createDocument(
  request: APIRequestContext,
  code: string,
  index: number
): Promise<{ status: number; body: Record<string, unknown>; meta: CreateResult }> {
  const marker = markerFor(code);
  const title = `DELETE/CLOSE VERIFY ${code} ${marker}`;
  const range = monthWindow(index);
  const response = await request.post(`${BASE}/api/journal-documents`, {
    data: {
      templateCode: code,
      title,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
    },
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown>;
  const id =
    typeof body?.document === "object" &&
    body.document &&
    typeof (body.document as { id?: unknown }).id === "string"
      ? ((body.document as { id: string }).id)
      : "";

  return {
    status: response.status(),
    body,
    meta: {
      id,
      title,
      dateFrom: range.dateFrom,
      dateTo: range.dateTo,
      seedDate: range.seedDate,
      marker,
    },
  };
}

async function postExternal(token: string, code: string, date: string, data: Record<string, unknown>) {
  const response = await fetch(`${BASE}/api/external/entries`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      organizationId: ORG_ID,
      journalCode: code,
      date,
      source: "destructive_buttons_verify",
      data,
    }),
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as Record<string, unknown> | null,
  };
}

async function putDocumentEntry(
  request: APIRequestContext,
  documentId: string,
  employeeId: string,
  date: string,
  data: Record<string, unknown>
) {
  const response = await request.put(`${BASE}/api/journal-documents/${documentId}/entries`, {
    data: {
      employeeId,
      date,
      data,
    },
  });

  return {
    status: response.status(),
    body: (await response.json().catch(() => null)) as Record<string, unknown> | null,
  };
}

async function postPestControlEntry(
  request: APIRequestContext,
  documentId: string,
  employeeId: string,
  data: Record<string, unknown>
) {
  const response = await request.post(`${BASE}/api/journal-documents/${documentId}/pest-control-entries`, {
    data: {
      ...data,
      acceptedEmployeeId: employeeId,
    },
  });

  return {
    status: response.status(),
    body: (await response.json().catch(() => null)) as Record<string, unknown> | null,
  };
}

async function patchDocumentConfig(
  request: APIRequestContext,
  documentId: string,
  config: Record<string, unknown>
) {
  const response = await request.patch(`${BASE}/api/journal-documents/${documentId}`, {
    data: { config },
  });

  return {
    status: response.status(),
    body: (await response.json().catch(() => null)) as Record<string, unknown> | null,
  };
}

async function fetchDocument(request: APIRequestContext, documentId: string) {
  const response = await request.get(`${BASE}/api/journal-documents/${documentId}`);
  const body = (await response.json().catch(() => null)) as
    | { document?: Record<string, unknown>; employees?: Array<Record<string, unknown>> }
    | null;
  return {
    status: response.status(),
    body,
    document: (body?.document || null) as Record<string, unknown> | null,
  };
}

async function saveIfVisible(page: Page) {
  const saveButton = page.getByRole("button", { name: /^Сохранить$/i }).first();
  if (!(await saveButton.count()) || !(await saveButton.isVisible().catch(() => false))) {
    return false;
  }
  if (await saveButton.isDisabled().catch(() => false)) {
    return false;
  }
  await saveButton.click();
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(500);
  return true;
}

async function acceptAnyConfirmDialogs(page: Page, action: () => Promise<void>) {
  const messages: string[] = [];
  const handler = async (dialog: { message(): string; accept(): Promise<void> }) => {
    messages.push(dialog.message());
    await dialog.accept();
  };
  page.on("dialog", handler);
  try {
    await action();
    await page.waitForTimeout(350);
  } finally {
    page.off("dialog", handler);
  }
  return messages;
}

async function confirmOpenModal(page: Page, confirmRegex: RegExp) {
  const dialog = page.locator("[role='dialog']").last();
  if ((await dialog.count()) === 0 || !(await dialog.isVisible().catch(() => false))) {
    return false;
  }
  const confirmButton = dialog.getByRole("button", { name: confirmRegex }).first();
  if (!(await confirmButton.count())) {
    return false;
  }
  await confirmButton.click();
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(350);
  return true;
}

async function firstVisible(locator: Locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    if (await item.isVisible().catch(() => false)) {
      return item;
    }
  }
  return null;
}

async function isCheckedLike(locator: Locator) {
  const ariaChecked = await locator.getAttribute("aria-checked").catch(() => null);
  if (ariaChecked === "true") {
    return true;
  }
  if (ariaChecked === "false") {
    return false;
  }

  return await locator.isChecked().catch(() => false);
}

async function firstVisibleUnchecked(locator: Locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    if (!(await item.isVisible().catch(() => false))) {
      continue;
    }
    if (await isCheckedLike(item)) {
      continue;
    }
    return item;
  }
  return null;
}

async function findMarkerContainer(page: Page, marker: string) {
  const candidates = [
    page.locator("tr", { hasText: marker }),
    page.locator("[role='row']", { hasText: marker }),
    page.locator("li", { hasText: marker }),
    page.locator("div", { hasText: marker }),
  ];
  for (const locator of candidates) {
    const visible = await firstVisible(locator);
    if (visible) return visible;
  }
  return null;
}

async function findListContainerByTitle(page: Page, title: string) {
  const titleNode = await firstVisible(page.getByText(title, { exact: true }));
  if (!titleNode) {
    return null;
  }

  const candidates = [
    titleNode.locator("xpath=ancestor::div[1]"),
    titleNode.locator("xpath=ancestor::div[2]"),
    titleNode.locator("xpath=ancestor::div[3]"),
    titleNode.locator("xpath=ancestor::article[1]"),
    titleNode.locator("xpath=ancestor::li[1]"),
    titleNode.locator("xpath=ancestor::tr[1]"),
  ];

  for (const locator of candidates) {
    const visible = await firstVisible(locator);
    if (visible) {
      return visible;
    }
  }

  return null;
}

function formatRuDate(seedDate: string) {
  const [year, month, day] = seedDate.split("-");
  if (!year || !month || !day) return seedDate;
  return `${day}.${month}.${year}`;
}

function formatDateDash(seedDate: string) {
  const [year, month, day] = seedDate.split("-");
  if (!year || !month || !day) return seedDate;
  return `${day}-${month}-${year}`;
}

async function findUvSeedContainer(page: Page, hints: DeleteHints) {
  const dateTexts = [formatRuDate(hints.seedDate), formatDateDash(hints.seedDate)];
  const candidates = [page.locator("tr"), page.locator("[role='row']")];

  for (const locator of candidates) {
    const count = await locator.count();
    for (let index = 0; index < count; index += 1) {
      const item = locator.nth(index);
      if (!(await item.isVisible().catch(() => false))) {
        continue;
      }
      const text = (await item.innerText().catch(() => "")) || "";
      if (!dateTexts.some((value) => text.includes(value))) {
        continue;
      }
      const checkbox = await firstVisible(
        item.locator("input[type='checkbox']:not([disabled]), [role='checkbox']")
      );
      if (!checkbox) {
        continue;
      }
      return item;
    }
  }

  return null;
}

async function selectCheckboxWithin(container: Locator) {
  const checkboxes = container.locator(
    "input[type='checkbox']:not([disabled]), [role='checkbox']"
  );
  const checkbox = (await firstVisibleUnchecked(checkboxes)) ?? (await firstVisible(checkboxes));
  if (!checkbox) return false;
  await checkbox.click({ force: true });
  await container.page().waitForTimeout(600);
  return true;
}

async function clickButtonByNames(scope: Locator | Page, names: RegExp[]) {
  for (const regex of names) {
    const button = await firstVisible(scope.getByRole("button", { name: regex }));
    if (button && !(await button.isDisabled().catch(() => false))) {
      await button.click({ force: true });
      return regex.source;
    }
  }
  for (const regex of names) {
    const menuItem = await firstVisible(scope.getByRole("menuitem", { name: regex }));
    if (menuItem && !(await menuItem.isDisabled().catch(() => false))) {
      await menuItem.click({ force: true });
      return `menu:${regex.source}`;
    }
  }
  const allButtons = scope.locator("button, [role='menuitem']");
  const count = await allButtons.count();
  for (let index = 0; index < count; index += 1) {
    const button = allButtons.nth(index);
    if (!(await button.isVisible().catch(() => false)) || (await button.isDisabled().catch(() => false))) {
      continue;
    }
    const text = ((await button.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    if (!text) {
      continue;
    }
    if (names.some((regex) => regex.test(text))) {
      await button.click({ force: true });
      return `text:${text}`;
    }
  }
  return null;
}

async function tryDeleteWithSelection(page: Page, code: string, hints: DeleteHints) {
  const container =
    code === "uv_lamp_runtime"
      ? await findUvSeedContainer(page, hints)
      : await findMarkerContainer(page, hints.marker);
  if (container && (await selectCheckboxWithin(container))) {
    const clicked = await clickButtonByNames(page, [
      /^Удалить выбранные/i,
      /^Удалить \(\d+\)$/i,
      /Удалить/i,
      /^Удалить$/i,
    ]);
    if (clicked) {
      return `marker-selection:${clicked}`;
    }
  }

  const bodyCheckboxes = page.locator(
    "main tbody input[type='checkbox']:not([disabled]), main tbody [role='checkbox'], main [role='row'] input[type='checkbox']:not([disabled]), main [role='row'] [role='checkbox']"
  );
  const fallbackCheckbox =
    (await firstVisibleUnchecked(bodyCheckboxes)) ?? (await firstVisible(bodyCheckboxes));
  if (fallbackCheckbox) {
    await fallbackCheckbox.click({ force: true });
    await page.waitForTimeout(600);
    const clicked = await clickButtonByNames(page, [
      /^Удалить выбранные/i,
      /^Удалить \(\d+\)$/i,
      /Удалить/i,
      /^Удалить$/i,
    ]);
    if (clicked) {
      return `fallback-selection:${clicked}`;
    }
  }

  return null;
}

async function tryDeleteInline(page: Page, marker: string) {
  const container = await findMarkerContainer(page, marker);
  if (container) {
    const clicked = await clickButtonByNames(container, [/^Удалить( строку)?$/i, /^Удалить$/i, /Удалить/i]);
    if (clicked) {
      return `marker-inline:${clicked}`;
    }
  }

  const clicked = await clickButtonByNames(page, [/^Удалить( строку)?$/i, /^Удалить$/i, /Удалить/i]);
  if (clicked) {
    return `global-inline:${clicked}`;
  }
  return null;
}

async function tryDeleteMedBook(page: Page, marker: string) {
  const markerContainer = await findMarkerContainer(page, marker);
  const editTrigger =
    (markerContainer ? await firstVisible(markerContainer.locator("button")) : null) ??
    (await firstVisible(page.locator("tbody button")));
  if (!editTrigger) {
    return null;
  }

  await editTrigger.click({ force: true });
  await page.waitForTimeout(500);

  const dialog = page.locator("[role='dialog']").last();
  if (!(await dialog.isVisible().catch(() => false))) {
    return null;
  }

  const deleteButton = await firstVisible(
    dialog.getByRole("button", {
      name: /^\u0423\u0434\u0430\u043b\u0438\u0442\u044c$/i,
    })
  );
  if (!deleteButton) {
    return null;
  }

  await deleteButton.click({ force: true });
  return "med-book-dialog";
}

async function tryDeleteSanitaryDayChecklist(page: Page) {
  const rows = page.locator("main table tbody tr");
  const rowCount = await rows.count();

  for (let index = 0; index < rowCount; index += 1) {
    const row = rows.nth(index);
    if (!(await row.isVisible().catch(() => false))) {
      continue;
    }

    const text = ((await row.textContent().catch(() => "")) || "").replace(/\s+/g, " ").trim();
    if (!text || !/\d+\.\d+/.test(text)) {
      continue;
    }

    await row.hover().catch(() => undefined);
    await page.waitForTimeout(150);

    const buttons = row.locator("button");
    if ((await buttons.count()) < 3) {
      continue;
    }

    const deleteButton = buttons.nth(2);
    if (!(await deleteButton.isVisible().catch(() => false))) {
      continue;
    }

    await deleteButton.click({ force: true });
    return "sanitary-day-inline";
  }

  return null;
}

async function tryDeleteColdEquipment(page: Page) {
  const equipmentLabel = await firstVisible(
    page.getByText(/\u0422\u0435\u043c\u043f\. \(T\)/)
  );
  if (!equipmentLabel) {
    return null;
  }

  const container =
    (await firstVisible(equipmentLabel.locator("xpath=ancestor::div[contains(@class,'grid')][1]"))) ??
    (await firstVisible(equipmentLabel.locator("xpath=ancestor::div[1]")));
  if (!container) {
    return null;
  }

  const editButton = await firstVisible(container.locator("button"));
  if (!editButton) {
    return null;
  }

  await editButton.click({ force: true });
  await page.waitForTimeout(500);

  const dialog = page.locator("[role='dialog']").last();
  if (!(await dialog.isVisible().catch(() => false))) {
    return null;
  }

  const deleteButton = await firstVisible(
    dialog.getByRole("button", {
      name: /^\u0423\u0434\u0430\u043b\u0438\u0442\u044c( \u0441\u0442\u0440\u043e\u043a\u0443)?$/i,
    })
  );
  if (!deleteButton) {
    return null;
  }

  await deleteButton.click({ force: true });
  return "cold-equipment-dialog";
}

async function performDelete(
  page: Page,
  request: APIRequestContext,
  code: string,
  documentId: string,
  hints: DeleteHints
) {
  const before = await fetchDocument(request, documentId);
  const beforeHash = bodyHash(before.document || {});

  const attempts = [
    () => {
      if (code === "med_books") {
        return tryDeleteMedBook(page, hints.marker);
      }
      if (code === "sanitary_day_control") {
        return tryDeleteSanitaryDayChecklist(page);
      }
      if (code === "cold_equipment_control") {
        return tryDeleteColdEquipment(page);
      }
      return Promise.resolve<string | null>(null);
    },
    () => tryDeleteWithSelection(page, code, hints),
    () => tryDeleteInline(page, hints.marker),
  ];
  const confirmRegex = /Удалить/i;
  const attemptErrors: string[] = [];
  for (const [attemptIndex, attempt] of attempts.entries()) {
    await page.goto(`${BASE}/journals/${code}/documents/${documentId}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

    let dialogMessages: string[] = [];
    try {
      dialogMessages = await acceptAnyConfirmDialogs(page, async () => {
        const result = await attempt();
        if (!result) {
          throw new Error("delete button not found");
        }
      });
    } catch (error) {
      attemptErrors.push(`attempt${attemptIndex + 1}:${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    await confirmOpenModal(page, confirmRegex).catch(() => false);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(800);

    let after = await fetchDocument(request, documentId);
    let saveUsed = false;
    if (bodyHash(after.document || {}) === beforeHash) {
      saveUsed = await saveIfVisible(page);
      if (saveUsed) {
        after = await fetchDocument(request, documentId);
      }
    }

    for (let poll = 0; poll < 6; poll += 1) {
      if (bodyHash(after.document || {}) !== beforeHash) {
        return {
          status: "PASS" as const,
          detail: `document changed after delete, dialogs=${dialogMessages.length}, poll=${poll + 1}`,
          strategy: `attempt${attemptIndex + 1}`,
          saveUsed,
        };
      }

      await page.waitForTimeout(500);
      after = await fetchDocument(request, documentId);
    }

    attemptErrors.push(`attempt${attemptIndex + 1}:state unchanged`);
  }

  return {
    status: "FAIL" as const,
    detail: `document state did not change after delete attempts (${attemptErrors.join("; ") || "no attempts"})`,
    strategy: "-",
    saveUsed: false,
  };
}

async function performCloseFromList(
  page: Page,
  request: APIRequestContext,
  code: string,
  documentId: string,
  title: string
) {
  await page.goto(`${BASE}/journals/${code}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

  const closeMenuNames = [
    /^РћС‚РїСЂР°РІРёС‚СЊ РІ Р·Р°РєСЂС‹С‚С‹Рµ$/i,
    /^РџРµСЂРµРЅРµСЃС‚Рё РґРѕРєСѓРјРµРЅС‚ РІ Р·Р°РєСЂС‹С‚С‹Рµ$/i,
    /^Р—Р°РєСЂС‹С‚СЊ$/i,
    /^Р—Р°РєРѕРЅС‡РёС‚СЊ$/i,
  ];

  const before = await fetchDocument(request, documentId);
  const beforeStatus = typeof before.document?.status === "string" ? before.document.status : "";
  if (beforeStatus === "closed") {
    return { messages: [] as string[] };
  }

  const container = await findListContainerByTitle(page, title);
  if (!container) {
    return null;
  }

  const visibleButtons = container.locator("button");
  const count = await visibleButtons.count();
  for (let index = 0; index < count; index += 1) {
    const button = visibleButtons.nth(index);
    if (!(await button.isVisible().catch(() => false)) || (await button.isDisabled().catch(() => false))) {
      continue;
    }

    let messages: string[] = [];
    try {
      messages = await acceptAnyConfirmDialogs(page, async () => {
        await button.click({ force: true });
      });
    } catch {
      continue;
    }
    await page.waitForTimeout(700);

    const menuAction = await clickButtonByNames(page, closeMenuNames);
    if (!menuAction) {
      await page.keyboard.press("Escape").catch(() => {});
      continue;
    }

    await confirmOpenModal(page, /^РћС‚РїСЂР°РІРёС‚СЊ РІ Р·Р°РєСЂС‹С‚С‹Рµ|^Р—Р°РєРѕРЅС‡РёС‚СЊ|^Р—Р°РєСЂС‹С‚СЊ|^РџРµСЂРµРЅРµСЃС‚Рё/i).catch(() => false);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(700);
    return { messages };
  }

  return null;
}

async function performClose(page: Page, request: APIRequestContext, code: string, documentId: string) {
  await page.goto(`${BASE}/journals/${code}/documents/${documentId}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

  const closeButton = await firstVisible(page.getByRole("button", { name: CLOSE_BUTTON_PATTERNS[0] }));
  if (!closeButton) {
    return {
      status: "FAIL" as const,
      detail: "close button not found",
    };
  }

  const messages = await acceptAnyConfirmDialogs(page, async () => {
    await closeButton.click({ force: true });
  });
  await confirmOpenModal(page, CLOSE_CONFIRM_PATTERN).catch(() => false);
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(700);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const after = await fetchDocument(request, documentId);
    const status = typeof after.document?.status === "string" ? after.document.status : "";
    if (status === "closed") {
      return {
        status: "PASS" as const,
        detail: `status=closed, dialogs=${messages.length}, poll=${attempt + 1}`,
      };
    }
    await page.waitForTimeout(500);
  }

  return {
    status: "FAIL" as const,
    detail: "status did not become closed",
  };
}

async function performCloseEnhanced(
  page: Page,
  request: APIRequestContext,
  code: string,
  documentId: string,
  title: string
) {
  await page.goto(`${BASE}/journals/${code}/documents/${documentId}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

  const detailCloseNames = CLOSE_BUTTON_PATTERNS;
  let messages: string[] = [];
  let triggered = false;

  for (const regex of detailCloseNames) {
    const closeButton = await firstVisible(page.getByRole("button", { name: regex }));
    if (!closeButton) {
      continue;
    }

    messages = await acceptAnyConfirmDialogs(page, async () => {
      await closeButton.click({ force: true });
    });
    await confirmOpenModal(page, CLOSE_CONFIRM_PATTERN).catch(() => false);
    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(700);
    triggered = true;
    break;
  }

  if (!triggered) {
    const fallback = await performCloseFromListV2(page, request, code, documentId, title);
    if (!fallback) {
      return {
        status: "FAIL" as const,
        detail: "close button not found",
      };
    }
    messages = fallback.messages;
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const after = await fetchDocument(request, documentId);
    const status = typeof after.document?.status === "string" ? after.document.status : "";
    if (status === "closed") {
      return {
        status: "PASS" as const,
        detail: `status=closed, dialogs=${messages.length}, poll=${attempt + 1}`,
      };
    }
    await page.waitForTimeout(500);
  }

  return {
    status: "FAIL" as const,
    detail: "status did not become closed",
  };
}

async function performCloseFromListV2(
  page: Page,
  request: APIRequestContext,
  code: string,
  documentId: string,
  title: string
) {
  await page.goto(`${BASE}/journals/${code}`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});

  const before = await fetchDocument(request, documentId);
  const beforeStatus = typeof before.document?.status === "string" ? before.document.status : "";
  if (beforeStatus === "closed") {
    return { messages: [] as string[] };
  }

  const container = await findListContainerByTitle(page, title);
  if (!container) {
    return null;
  }

  const triggers = container.locator("button");
  const triggerCount = await triggers.count();
  for (let index = 0; index < triggerCount; index += 1) {
    const trigger = triggers.nth(index);
    if (!(await trigger.isVisible().catch(() => false)) || (await trigger.isDisabled().catch(() => false))) {
      continue;
    }

    let messages: string[] = [];
    try {
      messages = await acceptAnyConfirmDialogs(page, async () => {
        await trigger.click({ force: true });
      });
    } catch {
      continue;
    }

    await page.waitForTimeout(500);
    const menuItems = page.locator("[role='menuitem']");
    const menuCount = await menuItems.count();
    let clicked = false;
    for (let menuIndex = 0; menuIndex < menuCount; menuIndex += 1) {
      const item = menuItems.nth(menuIndex);
      if (!(await item.isVisible().catch(() => false))) {
        continue;
      }
      const text = ((await item.textContent().catch(() => "")) || "").toLowerCase();
      if (!CLOSE_LIST_KEYWORDS.some((keyword) => text.includes(keyword))) {
        continue;
      }
      await item.click({ force: true });
      clicked = true;
      break;
    }

    if (!clicked) {
      await page.keyboard.press("Escape").catch(() => {});
      continue;
    }

    await page.waitForTimeout(300);
    const confirmButtons = page.locator("[role='dialog'] button, button");
    const confirmCount = await confirmButtons.count();
    for (let confirmIndex = 0; confirmIndex < confirmCount; confirmIndex += 1) {
      const button = confirmButtons.nth(confirmIndex);
      if (!(await button.isVisible().catch(() => false)) || (await button.isDisabled().catch(() => false))) {
        continue;
      }
      const text = ((await button.textContent().catch(() => "")) || "").toLowerCase();
      if (!CLOSE_LIST_KEYWORDS.some((keyword) => text.includes(keyword))) {
        continue;
      }
      await button.click({ force: true });
      break;
    }

    await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(700);
    return { messages };
  }

  return null;
}

const BUILDERS: Record<string, (date: string, marker: string) => Record<string, unknown>> = {
  accident_journal: (date, marker) => ({
    rows: [
      {
        accidentDate: date,
        accidentHour: "09",
        accidentMinute: "15",
        locationName: marker,
        accidentDescription: `${marker} accident`,
        affectedProducts: "5 kg",
        resolvedDate: date,
        resolvedHour: "10",
        resolvedMinute: "05",
        responsiblePeople: marker,
        correctiveActions: `${marker} fixed`,
      },
    ],
  }),
  audit_plan: (date, marker) => ({
    documentDate: date,
    columns: [{ id: "audit-1", title: marker, auditorName: marker }],
    sections: [{ id: "general", title: marker }],
    rows: [{ id: "row-1", sectionId: "general", text: marker, checked: true, values: { "audit-1": date } }],
  }),
  audit_protocol: (date, marker) => ({
    documentDate: date,
    basisTitle: marker,
    auditedObject: marker,
    sections: [{ id: "s1", title: marker }],
    rows: [{ id: "r1", sectionId: "s1", text: marker, result: "yes", note: marker }],
    signatures: [{ name: marker, role: marker, signedAt: date }],
  }),
  audit_report: (date, marker) => ({
    documentDate: date,
    auditedObject: marker,
    summary: marker,
    recommendations: marker,
    findings: [
      {
        nonConformity: marker,
        correctionActions: marker,
        correctiveActions: marker,
        responsibleName: marker,
        responsiblePosition: marker,
        dueDatePlan: date,
      },
    ],
    signatures: [{ role: marker, name: marker, position: marker, signedAt: date }],
  }),
  breakdown_history: (date, marker) => ({
    rows: [
      {
        startDate: date,
        startHour: "08",
        startMinute: "30",
        equipmentName: marker,
        breakdownDescription: marker,
        repairPerformed: marker,
        partsReplaced: marker,
        endDate: date,
        endHour: "09",
        endMinute: "45",
        downtimeHours: "1.25",
        responsiblePerson: marker,
      },
    ],
  }),
  cleaning: (_date, marker) => ({
    activityType: "wetCleaning",
    times: ["06:41", "18:19"],
    responsibleName: marker,
  }),
  cleaning_ventilation_checklist: () => ({
    procedures: {
      disinfection: ["06:41"],
      ventilation: ["14:21"],
    },
  }),
  climate_control: (_date, marker) => ({
    readings: [
      { roomName: "Склад", time: "10:00", temperature: 22.4, humidity: 51 },
      { roomName: "Склад", time: "17:00", temperature: 23.7, humidity: 55 },
    ],
    responsibleTitle: marker,
  }),
  cold_equipment_control: (_date, marker) => ({
    readings: [
      { equipmentName: "Холодильная камера", temp: 3.2 },
      { equipmentName: "Морозильный ларь", temp: -18 },
    ],
    responsibleTitle: marker,
  }),
  complaint_register: (date, marker) => ({
    rows: [
      {
        values: {
          receiptDate: date,
          applicantName: marker,
          complaintReceiptForm: "по телефону",
          applicantDetails: marker,
          complaintContent: marker,
          decisionDate: date,
          decisionSummary: marker,
        },
      },
    ],
  }),
  disinfectant_usage: (date, marker) => ({
    responsibleRole: marker,
    responsibleEmployee: marker,
    subdivisions: [
      {
        name: marker,
        area: 10,
        byCapacity: false,
        treatmentType: "current",
        frequencyPerMonth: 5,
        disinfectantName: marker,
        concentration: 0.5,
        solutionConsumptionPerSqm: 0.3,
        solutionPerTreatment: 3,
      },
    ],
    receipts: [
      {
        date,
        disinfectantName: marker,
        quantity: 3,
        unit: "l",
        expiryDate: date,
        responsibleRole: marker,
        responsibleEmployee: marker,
      },
    ],
    consumptions: [
      {
        periodFrom: date,
        periodTo: date,
        disinfectantName: marker,
        totalReceived: 3,
        totalReceivedUnit: "l",
        totalConsumed: 1,
        totalConsumedUnit: "l",
        remainder: 2,
        remainderUnit: "l",
        responsibleRole: marker,
        responsibleEmployee: marker,
      },
    ],
  }),
  equipment_calibration: (date, marker) => ({
    documentDate: date,
    approveRole: marker,
    approveEmployee: marker,
    rows: [
      {
        equipmentName: marker,
        equipmentNumber: "EQ-42",
        location: marker,
        purpose: marker,
        measurementRange: marker,
        calibrationInterval: 12,
        lastCalibrationDate: date,
        note: marker,
      },
    ],
  }),
  equipment_cleaning: (date, marker) => ({
    washDate: date,
    washTime: "07:12",
    equipmentName: marker,
    detergentName: marker,
    detergentConcentration: "1%",
    disinfectantName: marker,
    disinfectantConcentration: "0.5%",
    rinseTemperature: "78",
    rinseResult: "compliant",
    washerPosition: marker,
    washerName: marker,
    controllerPosition: marker,
    controllerName: marker,
  }),
  equipment_maintenance: (date, marker) => ({
    documentDate: date,
    approveRole: marker,
    approveEmployee: marker,
    responsibleRole: marker,
    responsibleEmployee: marker,
    rows: [
      {
        equipmentName: marker,
        workType: marker,
        maintenanceType: "A",
        plan: { jan: "05", feb: "-", mar: "-", apr: "-", may: "-", jun: "-", jul: "-", aug: "-", sep: "-", oct: "-", nov: "-", dec: "-" },
        fact: { jan: "05", feb: "", mar: "", apr: "", may: "", jun: "", jul: "", aug: "", sep: "", oct: "", nov: "", dec: "" },
      },
    ],
  }),
  finished_product: (date, marker) => ({
    rows: [
      {
        productionDateTime: `${date} 11:20`,
        rejectionTime: "11:40",
        productName: marker,
        organoleptic: marker,
        productTemp: "72",
        correctiveAction: marker,
        releasePermissionTime: "12:00",
        courierTransferTime: "12:10",
        oxygenLevel: "98",
        responsiblePerson: marker,
        inspectorName: marker,
        organolepticValue: marker,
        organolepticResult: marker,
        releaseAllowed: "yes",
      },
    ],
    itemsCatalog: [marker],
  }),
  fryer_oil: (date, marker) => ({
    startDate: date,
    startHour: 8,
    startMinute: 15,
    fatType: marker,
    qualityStart: 5,
    equipmentType: marker,
    productType: marker,
    endHour: 9,
    endMinute: 20,
    qualityEnd: 4,
    carryoverKg: 1.2,
    disposedKg: 0.4,
    controllerName: marker,
  }),
  general_cleaning: (date, marker) => ({
    year: Number(date.slice(0, 4)),
    documentDate: `${date.slice(0, 4)}-01-01`,
    approveRole: marker,
    approveEmployee: marker,
    responsibleRole: marker,
    responsibleEmployee: marker,
    rows: [
      {
        id: "ext-general-cleaning-row",
        roomName: marker,
        plan: {
          jan: "13",
          feb: "",
          mar: "",
          apr: "",
          may: "",
          jun: "",
          jul: "",
          aug: "",
          sep: "",
          oct: "",
          nov: "",
          dec: "",
        },
        fact: {
          jan: "13",
          feb: "",
          mar: "",
          apr: "",
          may: "",
          jun: "",
          jul: "",
          aug: "",
          sep: "",
          oct: "",
          nov: "",
          dec: "",
        },
      },
    ],
  }),
  glass_control: (_date, marker) => ({
    damagesDetected: true,
    itemName: marker,
    quantity: "3",
    damageInfo: marker,
  }),
  glass_items_list: (date, marker) => ({
    documentDate: date,
    location: marker,
    responsibleTitle: marker,
    rows: [{ location: marker, itemName: marker, quantity: "4" }],
  }),
  health_check: (_date, marker) => ({
    signed: true,
    measures: marker,
  }),
  hygiene: () => ({
    status: "healthy",
    temperatureAbove37: false,
  }),
  incoming_control: (date, marker) => ({
    rows: [
      {
        deliveryDate: date,
        deliveryHour: "11",
        deliveryMinute: "20",
        productName: marker,
        manufacturer: marker,
        supplier: marker,
        transportCondition: "satisfactory",
        packagingCompliance: "compliant",
        organolepticResult: "satisfactory",
        expiryDate: date,
        expiryHour: "18",
        expiryMinute: "00",
        note: marker,
        responsibleTitle: marker,
      },
    ],
    products: [marker],
    manufacturers: [marker],
    suppliers: [marker],
  }),
  incoming_raw_materials_control: (date, marker) => ({
    rows: [
      {
        deliveryDate: date,
        deliveryHour: "08",
        deliveryMinute: "40",
        productName: marker,
        manufacturer: marker,
        supplier: marker,
        transportCondition: "satisfactory",
        packagingCompliance: "compliant",
        organolepticResult: "satisfactory",
        expiryDate: date,
        note: marker,
        responsibleTitle: marker,
      },
    ],
    products: [marker],
    manufacturers: [marker],
    suppliers: [marker],
  }),
  intensive_cooling: (date, marker) => ({
    dishSuggestions: [marker],
    rows: [
      {
        productionDate: date,
        productionHour: "14",
        productionMinute: "00",
        dishName: marker,
        startTemperature: "85",
        endTemperature: "4",
        correctiveAction: marker,
        comment: marker,
        responsibleTitle: marker,
      },
    ],
  }),
  med_books: (date, marker) => ({
    birthDate: "1990-01-02",
    gender: "female",
    hireDate: date,
    medBookNumber: marker,
    note: marker,
    examinations: {
      Терапевт: { date, expiryDate: date },
    },
  }),
  metal_impurity: (date, marker) => ({
    startDate: date,
    responsiblePosition: marker,
    responsibleEmployee: marker,
    materials: [{ id: "mat-1", name: marker }],
    suppliers: [{ id: "sup-1", name: marker }],
    rows: [
      {
        date,
        materialId: "mat-1",
        supplierId: "sup-1",
        consumedQuantityKg: "100",
        impurityQuantityG: "2",
        impurityCharacteristic: marker,
        responsibleRole: marker,
        responsibleName: marker,
      },
    ],
  }),
  perishable_rejection: (date, marker) => ({
    manufacturers: [marker],
    suppliers: [marker],
    productLists: [{ id: "list-1", name: marker, items: [marker] }],
    rows: [
      {
        arrivalDate: date,
        arrivalTime: "09:20",
        productName: marker,
        productionDate: date,
        manufacturer: marker,
        supplier: marker,
        packaging: marker,
        quantity: "5 кг",
        documentNumber: marker,
        organolepticResult: "compliant",
        storageCondition: "2_6",
        expiryDate: date,
        actualSaleDate: date,
        actualSaleTime: "16:00",
        responsiblePerson: marker,
        note: marker,
      },
    ],
  }),
  pest_control: (date, marker) => ({
    performedDate: date,
    performedHour: "13",
    performedMinute: "05",
    timeSpecified: true,
    event: marker,
    areaOrVolume: marker,
    treatmentProduct: marker,
    note: marker,
    performedBy: marker,
    acceptedRole: marker,
  }),
  ppe_issuance: (date, marker) => ({
    showGloves: true,
    showShoes: true,
    rows: [
      {
        issueDate: date,
        maskCount: 1,
        gloveCount: 2,
        shoePairsCount: 1,
        clothingSetsCount: 1,
        capCount: 1,
        recipientTitle: marker,
        issuerTitle: marker,
      },
    ],
  }),
  product_writeoff: (date, marker) => ({
    documentDate: date,
    supplierName: marker,
    commissionMembers: [{ role: marker, employeeName: marker }],
    rows: [
      {
        productName: marker,
        batchNumber: marker,
        productionDate: date,
        quantity: "7 кг",
        discrepancyDescription: marker,
        action: marker,
      },
    ],
    productLists: [{ id: "list-1", name: marker, items: [marker] }],
  }),
  sanitary_day_control: (_date, marker) => ({
    responsibleName: marker,
    checkerName: marker,
  }),
  staff_training: (date, marker) => ({
    rows: [
      {
        date,
        employeeName: marker,
        employeePosition: marker,
        topic: marker,
        trainingType: "primary",
        instructorName: marker,
        attestationResult: "passed",
      },
    ],
  }),
  traceability_test: (date, marker) => ({
    dateFrom: date,
    rawMaterialList: [marker],
    productList: [marker],
    defaultResponsibleRole: marker,
    defaultResponsibleEmployee: marker,
    rows: [
      {
        date,
        incoming: {
          rawMaterialName: marker,
          batchNumber: marker,
          packagingDate: date,
          quantityPieces: 5,
          quantityKg: 4.2,
        },
        outgoing: {
          productName: marker,
          quantityPacksPieces: 2,
          quantityPacksKg: 1.2,
          shockTemp: -18,
        },
        responsibleRole: marker,
        responsibleEmployee: marker,
      },
    ],
  }),
  training_plan: (date, marker) => ({
    documentDate: date,
    approveRole: marker,
    approveEmployee: marker,
    topics: [{ id: "topic-1", name: marker }],
    rows: [{ id: "row-1", positionName: marker, cells: { "topic-1": { required: true, date: "04.26" } } }],
  }),
  uv_lamp_runtime: () => ({
    startTime: "09:00",
    endTime: "09:37",
  }),
};

async function verifyOne(params: {
  code: string;
  index: number;
  token: string;
  page: Page;
  context: BrowserContext;
}) {
  const { code, index, token, page, context } = params;
  const builder = BUILDERS[code];
  if (!builder) {
    throw new Error(`no builder for ${code}`);
  }

  const created = await createDocument(context.request, code, index);
  if (created.status !== 201 || !created.meta.id) {
    throw new Error(`create failed status=${created.status} body=${normalizeJson(created.body)}`);
  }

  const seedData = builder(created.meta.seedDate, created.meta.marker);
  const createdById =
    typeof created.body?.document === "object" &&
    created.body.document &&
    typeof (created.body.document as { createdById?: unknown }).createdById === "string"
      ? ((created.body.document as { createdById: string }).createdById)
      : "";
  const seed =
    code === "uv_lamp_runtime"
      ? await putDocumentEntry(context.request, created.meta.id, createdById, created.meta.seedDate, seedData)
      : code === "pest_control"
        ? await postPestControlEntry(context.request, created.meta.id, createdById, seedData)
        : CONFIG_CODES.has(code)
          ? await patchDocumentConfig(context.request, created.meta.id, seedData)
          : GENERIC_ENTRY_CODES.has(code)
            ? await putDocumentEntry(context.request, created.meta.id, createdById, created.meta.seedDate, seedData)
            : await postExternal(token, code, created.meta.seedDate, seedData);
  const seedDocumentId =
    code === "uv_lamp_runtime" || code === "pest_control" || CONFIG_CODES.has(code) || GENERIC_ENTRY_CODES.has(code)
      ? created.meta.id
      : typeof seed.body?.documentId === "string"
        ? seed.body.documentId
        : "";
  const deleteResult = await performDelete(page, context.request, code, created.meta.id, {
    marker: created.meta.marker,
    seedDate: created.meta.seedDate,
    seedTimeTexts: code === "uv_lamp_runtime" ? ["09:00", "09:37"] : undefined,
  });
  await fs.mkdir(path.join(OUT_DIR, "raw"), { recursive: true });
  await page.screenshot({
    path: path.join(OUT_DIR, "raw", `${code}-after-delete.png`),
    fullPage: true,
  });
  const closeResult = await performCloseEnhanced(page, context.request, code, created.meta.id, created.meta.title);
  await page.screenshot({
    path: path.join(OUT_DIR, "raw", `${code}-after-close.png`),
    fullPage: true,
  });

  const verdict =
    created.status === 201 &&
    [200, 201].includes(seed.status) &&
    seedDocumentId === created.meta.id &&
    deleteResult.status === "PASS" &&
    closeResult.status === "PASS"
      ? "PASS"
      : "FAIL";

  return {
    code,
    documentId: created.meta.id,
    title: created.meta.title,
    createStatus: created.status,
    seedStatus: seed.status,
    seedDocumentMatched: seedDocumentId === created.meta.id,
    deleteResult,
    closeResult,
    verdict,
  } satisfies CodeResult;
}

async function main() {
  const allCodes = await readCodes();
  const codes = REQUESTED_CODES.length > 0 ? allCodes.filter((code) => REQUESTED_CODES.includes(code)) : allCodes;
  const token = await readToken();
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(path.join(OUT_DIR, "raw"), { recursive: true });

  const { browser, context, page } = await login();
  const results: CodeResult[] = [];

  try {
    for (const code of codes) {
      try {
        const index = allCodes.indexOf(code);
        console.log(`starting ${code}`);
        const result = await verifyOne({ code, index, token, page, context });
        results.push(result);
        console.log(`[${code}] ${result.verdict} doc=${result.documentId}`);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        results.push({
          code,
          documentId: "",
          title: "",
          createStatus: 500,
          seedStatus: 500,
          seedDocumentMatched: false,
          deleteResult: { status: "FAIL", detail, strategy: "-", saveUsed: false },
          closeResult: { status: "FAIL", detail },
          verdict: "FAIL",
        });
        console.log(`[${code}] FAIL error=${detail}`);
      }
    }
  } finally {
    await browser.close();
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    total: results.length,
    pass: results.filter((item) => item.verdict === "PASS").length,
    fail: results.filter((item) => item.verdict === "FAIL").length,
    results,
  };

  await fs.writeFile(path.join(OUT_DIR, "evidence.json"), JSON.stringify(summary, null, 2), "utf8");

  const lines = [
    `# Destructive buttons verification - ${summary.generatedAt}`,
    `- Total journals: ${summary.total}`,
    `- PASS: ${summary.pass}`,
    `- FAIL: ${summary.fail}`,
    "",
    "| Code | Create | Seed | Delete | Close | Verdict |",
    "|---|---:|---:|---|---|---|",
    ...results.map(
      (item) =>
        `| ${item.code} | ${item.createStatus} | ${item.seedStatus}${item.seedDocumentMatched ? "" : " mismatch"} | ${item.deleteResult.status} (${item.deleteResult.strategy}${item.deleteResult.saveUsed ? ", save" : ""}) | ${item.closeResult.status} | ${item.verdict} |`
    ),
  ];
  await fs.writeFile(path.join(OUT_DIR, "evidence.md"), `${lines.join("\n")}\n`, "utf8");

  const failed = results.filter((item) => item.verdict === "FAIL");
  const problems = failed.length
    ? [
        "# Problems",
        "",
        ...failed.map(
          (item) =>
            `- ${item.code}: create=${item.createStatus}, seed=${item.seedStatus}, seedMatch=${item.seedDocumentMatched}, delete=${item.deleteResult.detail}, close=${item.closeResult.detail}`
        ),
      ].join("\n")
    : "# Problems\n\n- None.\n";
  await fs.writeFile(path.join(OUT_DIR, "problems.md"), `${problems}\n`, "utf8");

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
