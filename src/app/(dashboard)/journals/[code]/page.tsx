import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpenText, Ellipsis, Plus } from "lucide-react";
import { requireAuth } from "@/lib/auth-helpers";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { CreateDocumentDialog } from "@/components/journals/create-document-dialog";
import { HYGIENE_SAMPLE_DOCUMENTS } from "@/lib/hygiene-document";

function DemoDocumentRow({
  href,
  title,
  responsibleTitle,
  periodLabel,
}: {
  href: string;
  title: string;
  responsibleTitle: string | null;
  periodLabel: string;
}) {
  return (
    <Link
      href={href}
      className="grid grid-cols-[1.8fr_320px_290px_48px] items-center rounded-2xl border border-[#ececf4] bg-white px-6 py-5 shadow-[0_0_0_1px_rgba(240,240,250,0.45)] transition-colors hover:bg-[#fbfbff]"
    >
      <div className="text-[20px] font-semibold tracking-[-0.02em] text-black">{title}</div>
      <div className="border-l border-[#e6e6f0] px-10">
        <div className="text-[14px] text-[#84849a]">Должность ответственного</div>
        <div className="mt-2 text-[18px] font-semibold text-black">{responsibleTitle || ""}</div>
      </div>
      <div className="border-l border-[#e6e6f0] px-10">
        <div className="text-[14px] text-[#84849a]">Период</div>
        <div className="mt-2 text-[18px] font-semibold text-black">{periodLabel}</div>
      </div>
      <div className="flex items-center justify-center text-[#5b66ff]">
        <Ellipsis className="size-8" />
      </div>
    </Link>
  );
}

export default async function JournalDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { code } = await params;
  const { tab } = await searchParams;
  const session = await requireAuth();

  const template = await db.journalTemplate.findUnique({
    where: { code },
  });

  if (!template) {
    notFound();
  }

  const activeTab = tab === "closed" ? "closed" : "active";

  const orgUsers = await db.user.findMany({
    where: {
      organizationId: session.user.organizationId,
      isActive: true,
    },
    select: { id: true, name: true, role: true },
    orderBy: { name: "asc" },
  });

  if (code === "hygiene") {
    const visibleDocs = HYGIENE_SAMPLE_DOCUMENTS.filter((doc) => doc.status === activeTab);
    const heading =
      activeTab === "closed"
        ? "Гигиенический журнал (Закрытые!!!)"
        : "Гигиенический журнал";

    return (
      <div className="space-y-14">
        <div className="flex items-center justify-between">
          <h1 className="text-[62px] font-semibold tracking-[-0.04em] text-black">
            {heading}
          </h1>
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              className="h-16 rounded-2xl border-[#eef0fb] px-7 text-[18px] text-[#5464ff] shadow-none hover:bg-[#f8f9ff]"
              asChild
            >
              <Link href="/sanpin">
                <BookOpenText className="size-6" />
                Инструкция
              </Link>
            </Button>
            {activeTab === "active" && (
              <CreateDocumentDialog
                templateCode={code}
                templateName={template.name}
                users={orgUsers}
                triggerClassName="h-16 rounded-2xl bg-[#5b66ff] px-8 text-[18px] font-medium text-white hover:bg-[#4c58ff]"
                triggerLabel="Создать документ"
                triggerIcon={<Plus className="size-7" />}
              />
            )}
          </div>
        </div>

        <div className="border-b border-[#d9d9e4]">
          <div className="flex gap-12 text-[18px]">
            <Link
              href={`/journals/${code}`}
              className={`relative pb-5 ${
                activeTab === "active"
                  ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5b66ff]"
                  : "text-[#7c7c93]"
              }`}
            >
              Активные
            </Link>
            <Link
              href={`/journals/${code}?tab=closed`}
              className={`relative pb-5 ${
                activeTab === "closed"
                  ? "font-medium text-black after:absolute after:bottom-[-1px] after:left-0 after:h-[3px] after:w-full after:bg-[#5b66ff]"
                  : "text-[#7c7c93]"
              }`}
            >
              Закрытые
            </Link>
          </div>
        </div>

        <div className="space-y-6">
          {visibleDocs.map((doc) => (
            <DemoDocumentRow
              key={doc.id}
              href={`/journals/${code}/documents/${doc.id}`}
              title={doc.title}
              responsibleTitle={doc.responsibleTitle}
              periodLabel={doc.periodLabel}
            />
          ))}
        </div>
      </div>
    );
  }

  const documents = await db.journalDocument.findMany({
    where: {
      organizationId: session.user.organizationId,
      templateId: template.id,
      status: activeTab,
    },
    orderBy: { dateFrom: "desc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{template.name}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/sanpin">
              <BookOpenText className="size-4" />
              Инструкция
            </Link>
          </Button>
          <CreateDocumentDialog
            templateCode={code}
            templateName={template.name}
            users={orgUsers}
          />
        </div>
      </div>

      <div className="flex border-b">
        <Link
          href={`/journals/${code}`}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "active"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Активные
        </Link>
        <Link
          href={`/journals/${code}?tab=closed`}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "closed"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          Закрытые
        </Link>
      </div>

      <div className="space-y-3">
        {documents.map((doc) => (
          <Link
            key={doc.id}
            href={`/journals/${code}/documents/${doc.id}`}
            className="block rounded-xl border p-4"
          >
            {doc.title}
          </Link>
        ))}
      </div>
    </div>
  );
}
