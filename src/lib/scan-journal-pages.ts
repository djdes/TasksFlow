import { readdir } from "node:fs/promises";
import path from "node:path";
import { getScanJournalConfig } from "./scan-journal-config";

type ScanJournalPageFile = {
  fileName: string;
  pageNumber: number;
};

function parsePageNumber(fileName: string) {
  const match = fileName.match(/^\s*(\d+)\b/);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

export async function getScanJournalPageFiles(templateCode: string) {
  const config = getScanJournalConfig(templateCode);
  if (!config) return [];

  const folderPath = path.join(process.cwd(), "journals", config.folderName);

  try {
    const entries = await readdir(folderPath, { withFileTypes: true });

    const files = entries
      .filter((entry) => entry.isFile())
      .filter((entry) => /\.(jpe?g|png|webp)$/i.test(entry.name))
      .map((entry) => ({
        fileName: entry.name,
        pageNumber: parsePageNumber(entry.name),
      }))
      .sort((a, b) => {
        if (a.pageNumber !== b.pageNumber) {
          return a.pageNumber - b.pageNumber;
        }
        return a.fileName.localeCompare(b.fileName);
      });

    return files;
  } catch {
    return [];
  }
}

export async function getScanJournalPageCount(templateCode: string) {
  const files = await getScanJournalPageFiles(templateCode);
  return files.length;
}

export async function getScanJournalImageUrlBase(templateCode: string) {
  const files = await getScanJournalPageFiles(templateCode);
  if (files.length === 0) return null;

  const config = getScanJournalConfig(templateCode);
  if (!config) return null;

  return {
    folderName: config.folderName,
    pageCount: files.length,
  };
}
