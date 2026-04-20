export type CatalogRow = {
  rowKey: string;
  label: string;
  sublabel?: string;
  responsibleUserId: string | null;
  existingTasksflowTaskId: number | null;
};

export type CatalogDocument = {
  documentId: string;
  documentTitle: string;
  period: { from: string; to: string };
  rows: CatalogRow[];
};

export type CatalogJournal = {
  templateCode: string;
  label: string;
  description: string | null;
  iconName: string | null;
  hasAdapter?: boolean;
  documents: CatalogDocument[];
};

export type CatalogAssignableUser = {
  userId: string;
  name: string;
  positionTitle: string | null;
  tasksflowUserId: number;
};

export type WesetupCatalog = {
  journals: CatalogJournal[];
  assignableUsers?: CatalogAssignableUser[];
};

export type FlattenedJournalRow = {
  journal: CatalogJournal;
  document: CatalogDocument;
  row: CatalogRow;
};

export function flattenJournalRows(
  catalog: WesetupCatalog | null | undefined
): FlattenedJournalRow[] {
  if (!catalog) return [];
  const items: FlattenedJournalRow[] = [];
  for (const journal of catalog.journals) {
    for (const document of journal.documents) {
      for (const row of document.rows) {
        items.push({ journal, document, row });
      }
    }
  }
  return items;
}

export function filterJournals(
  journals: CatalogJournal[],
  rawSearch: string
): CatalogJournal[] {
  const query = rawSearch.trim().toLowerCase();
  if (!query) return journals;
  return journals.filter((journal) => {
    return (
      journal.label.toLowerCase().includes(query) ||
      (journal.description ?? "").toLowerCase().includes(query) ||
      journal.templateCode.toLowerCase().includes(query)
    );
  });
}

export function resolveActiveJournal(
  journals: CatalogJournal[],
  activeJournal: string
): string {
  if (journals.length === 0) return "";
  if (journals.some((journal) => journal.templateCode === activeJournal)) {
    return activeJournal;
  }
  return journals[0].templateCode;
}

export function filterJournalRows(
  rows: FlattenedJournalRow[],
  activeJournal: string,
  rawSearch: string
): FlattenedJournalRow[] {
  const query = rawSearch.trim().toLowerCase();
  return rows.filter((item) => {
    if (activeJournal && item.journal.templateCode !== activeJournal) {
      return false;
    }
    if (!query) return true;
    return (
      item.row.label.toLowerCase().includes(query) ||
      (item.row.sublabel ?? "").toLowerCase().includes(query) ||
      item.document.documentTitle.toLowerCase().includes(query) ||
      item.journal.label.toLowerCase().includes(query)
    );
  });
}
