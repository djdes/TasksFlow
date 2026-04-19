import Link from "next/link";
import {
  LayoutDashboard,
  MessageSquareText,
  NotebookText,
  ScrollText,
  Settings2,
} from "lucide-react";
import { requireRoot } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export default async function RootAreaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // All /root/* pages are gated here + in middleware. Middleware returns 404
  // without a valid root JWT, requireRoot() throws notFound() again as a
  // belt-and-braces safety net in case middleware is ever bypassed.
  const session = await requireRoot();

  return (
    <div className="min-h-screen bg-[#f4f5fb]">
      <header className="border-b border-[#dddfe8] bg-[#11142b] text-white">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center justify-between gap-3 px-4 py-4 sm:gap-4 sm:px-8 sm:py-5">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/60 sm:text-[12px]">
              HACCP-Online · Platform
            </div>
            <div className="mt-1 truncate text-[16px] font-semibold tracking-tight sm:text-[20px]">
              {session.user.name || session.user.email}
            </div>
          </div>
          <nav className="-mx-4 flex items-center gap-4 overflow-x-auto px-4 text-[13px] [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0 sm:gap-6 sm:overflow-visible sm:px-0 sm:text-[14px]">
            <Link
              href="/root"
              className="inline-flex items-center gap-2 hover:text-white"
            >
              <LayoutDashboard className="size-4" />
              Организации
            </Link>
            <Link
              href="/root/feedback"
              className="inline-flex items-center gap-2 hover:text-white"
            >
              <MessageSquareText className="size-4" />
              Обратная связь
            </Link>
            <Link
              href="/root/blog"
              className="inline-flex items-center gap-2 hover:text-white"
            >
              <NotebookText className="size-4" />
              Блог
            </Link>
            <Link
              href="/root/telegram-logs"
              className="inline-flex items-center gap-2 hover:text-white"
            >
              <ScrollText className="size-4" />
              Telegram логи
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 hover:bg-white/20"
            >
              <Settings2 className="size-4" />
              Выйти в приложение
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
    </div>
  );
}
