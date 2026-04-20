export type TargetArgs = {
  journalCode: string;
  isDocument: boolean;
  activeDocumentId: string | null;
};

export function resolveJournalObligationTargetPath(
  args: TargetArgs
): string {
  const { journalCode, isDocument, activeDocumentId } = args;
  void activeDocumentId;

  const basePath = `/mini/journals/${journalCode}`;
  return isDocument ? basePath : `${basePath}/new`;
}

export function buildMiniObligationEntryUrl(
  miniAppBaseUrl: string,
  obligationId: string
): string {
  return `${miniAppBaseUrl.replace(/\/+$/, "")}/o/${obligationId}`;
}
