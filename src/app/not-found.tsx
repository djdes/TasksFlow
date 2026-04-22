import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

export const metadata = {
  title: "Страница не найдена — WeSetup",
};

/**
 * Кастомная 404 — без бренд-неловкости от дефолтной английской версии
 * Next.js. Использует тот же indigo-аскет, что и рабочие страницы;
 * ведёт на дашборд / на главную, чтобы пользователь не застревал.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafbff] px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-[#ececf4] bg-white p-8 text-center shadow-[0_0_0_1px_rgba(240,240,250,0.45)]">
        <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-[#eef1ff] text-[#5566f6]">
          <Compass className="size-7" />
        </div>
        <h1 className="mt-6 text-[clamp(1.5rem,4vw+1rem,2.25rem)] font-semibold tracking-[-0.02em] text-[#0b1024]">
          Страница не найдена
        </h1>
        <p className="mt-3 text-[14px] leading-relaxed text-[#6f7282]">
          Ссылка устарела или раздел перенесён. Вернитесь на главную или
          откройте дашборд, чтобы продолжить работу.
        </p>
        <div className="mt-7 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-[#dcdfed] bg-white px-4 text-[14px] font-medium text-[#0b1024] transition-colors hover:border-[#5566f6]/40 hover:bg-[#f5f6ff]"
          >
            <ArrowLeft className="size-4" />
            На главную
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-2xl bg-[#5566f6] px-4 text-[14px] font-medium text-white shadow-[0_10px_30px_-12px_rgba(85,102,246,0.55)] transition-colors hover:bg-[#4a5bf0]"
          >
            Открыть дашборд
          </Link>
        </div>
      </div>
    </div>
  );
}
