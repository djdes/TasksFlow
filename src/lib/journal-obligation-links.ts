type EntryTargetArgs = {
  journalCode: string;
  isDocument: false;
  activeDocumentId: null;
};

type DocumentTargetArgs = {
  journalCode: string;
  isDocument: true;
  activeDocumentId: string | null;
};

export type TargetArgs = EntryTargetArgs | DocumentTargetArgs;

const MINI_APP_ORIGIN = "https://wesetup.local";

export function resolveJournalObligationTargetPath(
  args: TargetArgs
): string {
  const { journalCode, isDocument, activeDocumentId } = args;
  if (!isDocument && activeDocumentId !== null) {
    throw new Error("Entry journal targets cannot include activeDocumentId");
  }

  const basePath = `/mini/journals/${journalCode}`;
  return isDocument ? basePath : `${basePath}/new`;
}

export function sanitizeMiniAppRedirectPath(
  targetPath: string
): string | null {
  try {
    const url = new URL(targetPath, MINI_APP_ORIGIN);
    if (url.origin !== MINI_APP_ORIGIN) {
      return null;
    }

    if (
      url.pathname !== "/mini" &&
      !url.pathname.startsWith("/mini/")
    ) {
      return null;
    }

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function buildMiniObligationEntryUrl(
  miniAppBaseUrl: string,
  obligationId: string
): string {
  return `${miniAppBaseUrl.replace(/\/+$/, "")}/o/${obligationId}`;
}
