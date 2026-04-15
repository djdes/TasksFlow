import { DocumentBackLink } from "@/components/journals/document-back-link";

/**
 * Shared layout for every `/journals/<code>` list page. Adds a single
 * "← Назад" link above whatever the per-template DocumentsClient renders,
 * so users always have a consistent way to jump back to the catalogue.
 * The per-template client itself doesn't render a back link (it's the
 * journal's own main page, not a document), so we provide it here.
 */
export default function JournalCodeLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <DocumentBackLink href="/journals" />
      {children}
    </div>
  );
}
