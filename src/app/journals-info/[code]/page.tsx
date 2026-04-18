import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Lightbulb,
  ScrollText,
} from "lucide-react";
import { PublicHeader, PublicFooter } from "@/components/public/public-chrome";
import {
  JOURNAL_INFO,
  JOURNAL_CATEGORY_LABEL,
} from "@/content/journal-info";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const info = JOURNAL_INFO[code];
  if (!info) return { title: "Журнал не найден — WeSetup" };
  return {
    title: `${info.tagline} — WeSetup`,
    description: info.why,
  };
}

export default async function JournalInfoDetailPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const info = JOURNAL_INFO[code];
  if (!info) notFound();

  const related = Object.values(JOURNAL_INFO)
    .filter((j) => j.category === info.category && j.code !== info.code)
    .slice(0, 4);

  return (
    <div className="min-h-screen bg-white text-[#0b1024]">
      <PublicHeader activeSection="journals-info" />

      <section className="mx-auto max-w-[1200px] px-6">
        <div className="relative overflow-hidden rounded-3xl bg-[#0b1024] px-6 py-14 text-white md:px-12 md:py-16">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 -top-24 size-[380px] rounded-full bg-[#5566f6] opacity-40 blur-[120px]" />
            <div className="absolute -bottom-32 -right-32 size-[420px] rounded-full bg-[#7a5cff] opacity-30 blur-[140px]" />
          </div>
          <div className="relative">
            <Link
              href="/journals-info"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/70 transition-colors hover:text-white"
            >
              <ArrowLeft className="size-4" />
              Ко всем журналам
            </Link>
            <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[12px] font-medium uppercase tracking-[0.18em] text-white/80 backdrop-blur">
              <BookOpenCheck className="size-3.5" />
              {JOURNAL_CATEGORY_LABEL[info.category]}
            </div>
            <h1 className="mt-4 max-w-[780px] text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] md:text-[44px]">
              {info.tagline}
            </h1>
            <p className="mt-4 max-w-[720px] text-[16px] leading-[1.6] text-white/80 md:text-[18px]">
              {info.why}
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1200px] px-6 py-12">
        <div className="grid gap-6 md:grid-cols-[1fr_320px]">
          {/* MAIN */}
          <div className="space-y-8">
            {/* WHAT TO FILL */}
            <div className="rounded-3xl border border-[#ececf4] bg-white p-7">
              <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#3848c7]">
                <CheckCircle2 className="size-4" />
                Что заполняется
              </div>
              <ul className="mt-4 space-y-2.5 text-[15px] leading-[1.6] text-[#3c4053]">
                {info.whatToFill.map((item, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-2 inline-block size-1.5 shrink-0 rounded-full bg-[#5566f6]" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* NORMATIVE */}
            <div className="rounded-3xl border border-[#ececf4] bg-white p-7">
              <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#3848c7]">
                <ScrollText className="size-4" />
                На основании
              </div>
              <ul className="mt-4 space-y-2 text-[15px] text-[#3c4053]">
                {info.normative.map((n, i) => (
                  <li key={i}>
                    <span className="font-medium text-[#0b1024]">
                      {n.title}
                    </span>
                    {n.pointer ? (
                      <span className="text-[#6f7282]">, {n.pointer}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>

            {/* TIPS */}
            {info.tips.length > 0 && (
              <div className="rounded-3xl border border-[#c8f0d5] bg-[#ecfdf5] p-7">
                <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#116b2a]">
                  <Lightbulb className="size-4" />
                  Как помогает WeSetup
                </div>
                <ul className="mt-4 space-y-2.5 text-[15px] leading-[1.6] text-[#116b2a]">
                  {info.tips.map((t, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="mt-2 inline-block size-1.5 shrink-0 rounded-full bg-[#116b2a]" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* SIDEBAR */}
          <aside className="space-y-5">
            <div className="rounded-3xl border border-[#ececf4] bg-[#fafbff] p-6">
              <div className="text-[13px] font-medium text-[#6f7282]">
                Код журнала
              </div>
              <div className="mt-1 font-mono text-[15px] font-semibold text-[#0b1024]">
                {info.code}
              </div>
              <Link
                href="/register"
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#5566f6] px-4 py-3 text-[14px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(85,102,246,0.55)] transition-colors hover:bg-[#4a5bf0]"
              >
                Попробовать бесплатно
                <ArrowRight className="size-4" />
              </Link>
              <p className="mt-3 text-[12px] leading-[1.5] text-[#6f7282]">
                Все журналы доступны на бесплатном тарифе — без
                ограничений по времени и без карты.
              </p>
            </div>

            {related.length > 0 && (
              <div className="rounded-3xl border border-[#ececf4] bg-white p-6">
                <div className="text-[13px] font-medium uppercase tracking-[0.14em] text-[#6f7282]">
                  Похожие журналы
                </div>
                <ul className="mt-3 space-y-2">
                  {related.map((r) => (
                    <li key={r.code}>
                      <Link
                        href={`/journals-info/${r.code}`}
                        className="group flex flex-col gap-0.5 rounded-xl p-2 transition-colors hover:bg-[#f5f6ff]"
                      >
                        <span className="text-[14px] font-medium text-[#0b1024] group-hover:text-[#3848c7]">
                          {r.tagline}
                        </span>
                        <span className="font-mono text-[11px] text-[#6f7282]">
                          {r.code}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </aside>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
