import { describe, expect, it } from "vitest";
import {
  filterJournalRows,
  filterJournals,
  flattenJournalRows,
  groupJournalRowsByDocument,
  resolveActiveJournal,
  resolveJournalUi,
} from "@shared/wesetup-journal-mode";
import { parseJournalLink } from "../shared/journal-link";

const catalog = {
  journals: [
    {
      templateCode: "cleaning",
      label: "Журнал уборки",
      description: "Ежедневная уборка",
      iconName: null,
      hasAdapter: true,
      documents: [
        {
          documentId: "doc-1",
          documentTitle: "Апрель",
          period: { from: "2026-04-01", to: "2026-04-30" },
          rows: [
            {
              rowKey: "row-1",
              label: "Мойка кухни",
              sublabel: "Иван",
              responsibleUserId: "u-1",
              existingTasksflowTaskId: null,
            },
          ],
        },
      ],
    },
    {
      templateCode: "health_check",
      label: "Журнал здоровья",
      description: "Осмотры сотрудников",
      iconName: null,
      hasAdapter: false,
      documents: [
        {
          documentId: "doc-2",
          documentTitle: "Смена 1",
          period: { from: "2026-04-20", to: "2026-04-20" },
          rows: [],
        },
      ],
    },
  ],
};

describe("wesetup journal mode helpers", () => {
  it("filterJournals searches by label and code", () => {
    expect(filterJournals(catalog.journals, "здоров")).toHaveLength(1);
    expect(filterJournals(catalog.journals, "clean")).toHaveLength(1);
  });

  it("resolveActiveJournal keeps current journal when still visible", () => {
    expect(resolveActiveJournal(catalog.journals, "health_check")).toBe(
      "health_check"
    );
  });

  it("resolveActiveJournal falls back to first visible journal", () => {
    expect(resolveActiveJournal(catalog.journals, "missing")).toBe("cleaning");
  });

  it("flattenJournalRows + filterJournalRows search across row/doc/journal", () => {
    const rows = flattenJournalRows(catalog);
    expect(rows).toHaveLength(1);
    expect(filterJournalRows(rows, "cleaning", "иван")).toHaveLength(1);
    expect(filterJournalRows(rows, "cleaning", "апрель")).toHaveLength(1);
    expect(filterJournalRows(rows, "health_check", "")).toHaveLength(0);
  });
});

describe("journal composer helpers", () => {
  it("groups active journal rows by document for collapsible document blocks", () => {
    const rows = flattenJournalRows({
      journals: [
        {
          ...catalog.journals[0],
          documents: [
            catalog.journals[0].documents[0],
            {
              documentId: "doc-3",
              documentTitle: "РњР°Р№",
              period: { from: "2026-05-01", to: "2026-05-31" },
              rows: [
                {
                  rowKey: "row-2",
                  label: "РњРѕР№РєР° Р±Р°СЂР°",
                  responsibleUserId: "u-2",
                  existingTasksflowTaskId: null,
                },
              ],
            },
          ],
        },
      ],
    });

    const groups = groupJournalRowsByDocument(rows, "cleaning");
    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.document.documentId)).toEqual([
      "doc-1",
      "doc-3",
    ]);
    expect(groups[1].rows[0].row.label).toBe("РњРѕР№РєР° Р±Р°СЂР°");
  });

  it("resolveJournalUi merges defaults with journal specific wording", () => {
    const resolved = resolveJournalUi({
      ...catalog.journals[1],
      ui: {
        subjectLabel: "РЎРѕС‚СЂСѓРґРЅРёРє",
        titlePlaceholder:
          "РќР°РїСЂРёРјРµСЂ: РџСЂРѕРІРµСЃС‚Рё РїСЂРµРґСЃРјРµРЅРЅС‹Р№ РѕСЃРјРѕС‚СЂ",
        submitLabel: "РЎРѕР·РґР°С‚СЊ Р·Р°РґР°С‡Сѓ РїРѕ Р¶СѓСЂРЅР°Р»Сѓ Р·РґРѕСЂРѕРІСЊСЏ",
      },
    });

    expect(resolved.subjectLabel).toBe("РЎРѕС‚СЂСѓРґРЅРёРє");
    expect(resolved.documentLabel).toBe("Документ журнала");
    expect(resolved.submitLabel).toContain("Р·РґРѕСЂРѕРІСЊСЏ");
  });
});

describe("journal link parsing", () => {
  it("accepts generic wesetup journal kinds, not only cleaning", () => {
    const raw = JSON.stringify({
      kind: "wesetup-health_check",
      baseUrl: "https://wesetup.ru",
      integrationId: "int-1",
      documentId: "doc-2",
      rowKey: "freetask:abc",
      label: "Проверить температуру",
      isFreeText: true,
    });

    const parsed = parseJournalLink(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.kind).toBe("wesetup-health_check");
  });
});
