import { useEffect, useState } from "react";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function fmt(remaining: number): string {
  const d = Math.floor(remaining / 86400);
  const h = Math.floor((remaining % 86400) / 3600);
  const m = Math.floor((remaining % 3600) / 60);
  const s = remaining % 60;
  return d > 0 ? `${d}д ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/**
 * Честный таймер акции: тикает только если у баннера задана реальная дата
 * окончания (endsAt). Никакого фейкового «только сегодня» с ежедневным
 * сбросом - когда время вышло, таймер исчезает (а сам баннер перестаёт
 * отдаваться API по окну дат). Рендерится только на клиенте (внутри
 * баннера, который и так появляется после гидрации) - mismatch'а нет.
 */
export function Countdown({ endsAt, className = "" }: { endsAt: number | null; className?: string }) {
  const [now, setNow] = useState<number>(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, [endsAt]);

  if (!endsAt) return null;
  const remaining = endsAt - now;
  if (remaining <= 0) return null;

  return (
    <span className={className} aria-label="До конца акции">
      до конца: <span className="tabular-nums">{fmt(remaining)}</span>
    </span>
  );
}
