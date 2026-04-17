import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BellRing,
  Cloud,
  Leaf,
  Plug,
  Sparkles,
  Timer,
  UserCheck,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { PublicHeader, PublicFooter } from "@/components/public/public-chrome";
import { ArticleRenderer } from "@/components/public/article-renderer";
import { FEATURES_INFO, FEATURES_ORDER } from "@/content/features";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const ICON_MAP: Record<string, LucideIcon> = {
  Plug,
  Wand2,
  Cloud,
  UserCheck,
  BellRing,
  Bell,
  Leaf,
  Timer,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const info = FEATURES_INFO[slug];
  if (!info) return { title: "Возможность не найдена — WeSetup" };
  return {
    title: `${info.title} — WeSetup`,
    description: info.tagline,
  };
}

export default async function FeatureDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const info = FEATURES_INFO[slug];
  if (!info) notFound();

  const Icon = ICON_MAP[info.iconName] ?? Sparkles;

  const others = FEATURES_ORDER.filter((s) => s !== slug)
    .slice(0, 4)
    .map((s) => FEATURES_INFO[s]);

  return (
    <div className="min-h-screen bg-white text-[#0b1024]">
      <PublicHeader activeSection="home" />

      {/* HERO */}
      <section className="mx-auto max-w-[1200px] px-6">
        <div className="relative overflow-hidden rounded-3xl bg-[#0b1024] px-6 py-14 text-white md:px-12 md:py-16">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-24 -top-24 size-[380px] rounded-full bg-[#5566f6] opacity-40 blur-[120px]" />
            <div className="absolute -bottom-32 -right-32 size-[420px] rounded-full bg-[#7a5cff] opacity-30 blur-[140px]" />
          </div>
          <div className="relative">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/70 transition-colors hover:text-white"
            >
              <ArrowLeft className="size-4" />
              На главную
            </Link>
            <div className="mt-6 inline-flex size-14 items-center justify-center rounded-2xl bg-white/10 text-white backdrop-blur">
              <Icon className="size-7" />
            </div>
            <h1 className="mt-5 max-w-[760px] text-[36px] font-semibold leading-[1.1] tracking-[-0.02em] md:text-[48px]">
              {info.title}
            </h1>
            <p className="mt-4 max-w-[720px] text-[16px] leading-[1.6] text-white/80 md:text-[18px]">
              {info.tagline}
            </p>
          </div>
        </div>
      </section>

      {/* BODY */}
      <section className="mx-auto max-w-[1200px] px-6 py-12">
        <div className="grid gap-8 md:grid-cols-[1fr_320px]">
          <div className="min-w-0">
            <ArticleRenderer blocks={info.body} />
          </div>
          <aside className="space-y-5">
            <div className="rounded-3xl border border-[#ececf4] bg-[#fafbff] p-6">
              <div className="text-[13px] font-medium text-[#6f7282]">
                Попробовать возможность
              </div>
              <p className="mt-2 text-[13px] leading-[1.5] text-[#6f7282]">
                14 дней демо со всеми функциями, включая интеграции. Без
                привязки карты.
              </p>
              <Link
                href="/register"
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#5566f6] px-4 py-3 text-[14px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(85,102,246,0.55)] transition-colors hover:bg-[#4a5bf0]"
              >
                Попробовать
                <ArrowRight className="size-4" />
              </Link>
            </div>
            {others.length > 0 && (
              <div className="rounded-3xl border border-[#ececf4] bg-white p-6">
                <div className="text-[13px] font-medium uppercase tracking-[0.14em] text-[#6f7282]">
                  Ещё возможности
                </div>
                <ul className="mt-3 space-y-1">
                  {others.map((o) => {
                    const OIcon = ICON_MAP[o.iconName] ?? Sparkles;
                    return (
                      <li key={o.slug}>
                        <Link
                          href={`/features/${o.slug}`}
                          className="group flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-[#f5f6ff]"
                        >
                          <span className="flex size-8 items-center justify-center rounded-lg bg-[#eef1ff] text-[#5566f6]">
                            <OIcon className="size-4" />
                          </span>
                          <span className="text-[14px] font-medium text-[#0b1024] group-hover:text-[#3848c7]">
                            {o.title}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
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
