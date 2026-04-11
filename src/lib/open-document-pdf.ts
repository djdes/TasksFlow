"use client";

export async function openDocumentPdf(documentId: string) {
  const response = await fetch(`/api/journal-documents/${documentId}/pdf`, {
    method: "GET",
    credentials: "include",
  });

  const contentType = response.headers.get("content-type") || "";
  if (!response.ok || !contentType.includes("application/pdf")) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || "Не удалось открыть PDF");
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const nextWindow = window.open(blobUrl, "_blank", "noopener,noreferrer");

  if (!nextWindow) {
    URL.revokeObjectURL(blobUrl);
    throw new Error("Браузер заблокировал открытие PDF");
  }

  window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
}
