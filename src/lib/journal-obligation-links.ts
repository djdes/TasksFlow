export type TargetArgs = {
  journalCode: string;
  isDocument: boolean;
  activeDocumentId: string | null;
};

export function resolveJournalObligationTargetPath(
  args: TargetArgs
): string {
  const basePath = `/mini/journals/${args.journalCode}`;
  return args.isDocument ? basePath : `${basePath}/new`;
}

export function buildMiniObligationEntryUrl(
  miniAppBaseUrl: string,
  obligationId: string
): string {
  return `${miniAppBaseUrl.replace(/\/+$/, "")}/o/${obligationId}`;
}
