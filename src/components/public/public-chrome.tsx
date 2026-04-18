import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

/**
 * Top nav shared across the marketing landing, the blog, and the journal
 * catalogue. Keeps the WeSetup lockup + Войти + Попробовать CTA the same
 * across every public entry point. Secondary links (Блог, Журналы) show
 * only on ≥sm to keep the mobile bar tidy.
 */
export function PublicHeader({
  activeSection,
}: {
  activeSection?: "blog" | "journals-info" | "home";
}) {
  const link = (section: string, label: string, href: string) => (
    <Link
      href={href}
      className={
        "hidden text-[14px] font-medium transition-colors hover:text-[#0b1024] sm:inline" +
        (activeSection === section
          ? " text-[#0b1024]"
          : " text-[#6f7282]")
      }
    >
      {label}
    </Link>
  );

  return (
    <nav className="mx-auto flex max-w-[1200px] items-center justify-between px-6 py-5">
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-[18px] font-semibold tracking-tight"
      >
        <span className="flex size-9 items-center justify-center rounded-xl bg-[#5566f6] text-white ring-1 ring-white/20">
          <ShieldCheck className="size-5" />
        </span>
        <span className="text-[#0b1024]">WeSetup</span>
      </Link>
      <div className="flex items-center gap-4 sm:gap-5">
        {link("journals-info", "Журналы", "/journals-info")}
        {link("blog", "Блог", "/blog")}
        <Link
          href="/login"
          className="hidden h-10 items-center rounded-2xl border border-[#dcdfed] bg-white px-4 text-[14px] font-medium text-[#0b1024] transition-colors hover:border-[#5566f6]/40 hover:bg-[#f5f6ff] sm:inline-flex"
        >
          Войти
        </Link>
        <Link
          href="/register"
          className="inline-flex h-10 items-center gap-2 rounded-2xl bg-[#5566f6] px-4 text-[14px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(85,102,246,0.55)] transition-colors hover:bg-[#4a5bf0]"
        >
          <span className="hidden sm:inline">Попробовать бесплатно</span>
          <span className="sm:hidden">Попробовать</span>
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </nav>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-[#ececf4]">
      <div className="mx-auto grid max-w-[1200px] gap-10 px-6 py-12 md:grid-cols-[1.4fr_auto_auto]">
        <div>
          <div className="inline-flex items-center gap-2 text-[16px] font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-[#5566f6] text-white">
              <ShieldCheck className="size-4" />
            </span>
            WeSetup
          </div>
          <p className="mt-3 max-w-[440px] text-[13px] text-[#9b9fb3]">
            Сервис электронных журналов СанПиН и ХАССП для общепита и пищевых
            производств. © 2026 WeSetup.
          </p>
        </div>

        <div className="min-w-[220px] text-[12px] leading-[1.6] text-[#6f7282]">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9b9fb3]">
            Реквизиты
          </div>
          <div className="font-medium text-[#0b1024]">ООО «БФС»</div>
          <div>ИНН 5018215599 · КПП 501801001</div>
          <div>ОГРН 1235000105306</div>
          <div>141065, Московская область, г. Королёв, ул. Ленина, д. 10/6</div>
          <div className="mt-2">
            <a href="tel:+79996341612" className="hover:text-[#0b1024]">
              +7 (999) 634-16-12
            </a>
          </div>
          <div>
            <a
              href="mailto:magazinlenina@gmail.com"
              className="hover:text-[#0b1024]"
            >
              magazinlenina@gmail.com
            </a>
          </div>
        </div>

        <div className="flex flex-col flex-wrap gap-2 text-[13px] text-[#6f7282] md:items-end">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9b9fb3] md:text-right">
            Разделы
          </div>
          <Link href="/blog" className="hover:text-[#0b1024]">Блог</Link>
          <Link href="/journals-info" className="hover:text-[#0b1024]">Журналы</Link>
          <Link href="/login" className="hover:text-[#0b1024]">Войти</Link>
          <Link href="/register" className="hover:text-[#0b1024]">Регистрация</Link>
          <a
            href="https://t.me/wesetupbot"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#0b1024]"
          >
            Telegram
          </a>
        </div>
      </div>
    </footer>
  );
}
