import { useEffect, useRef, useState } from "react";

/**
 * Баланс премии вырос — вернуть прибавку для короткой анимации «+30 ₽» у
 * баланса. Первую загрузку и уменьшение (отмена, выплата) не празднуем.
 * key меняется на каждую прибавку: два выполнения подряд — две анимации.
 */
export function useBonusGain(balance: number | null | undefined, holdMs = 2400): { gain: number; key: number } | null {
  const prev = useRef<number | null>(null);
  const [gain, setGain] = useState<{ gain: number; key: number } | null>(null);
  useEffect(() => {
    if (typeof balance !== "number") return;
    const before = prev.current;
    prev.current = balance;
    if (before === null || balance <= before) return;
    setGain({ gain: balance - before, key: Date.now() });
  }, [balance]);
  useEffect(() => {
    if (!gain) return;
    const t = setTimeout(() => setGain(null), holdMs);
    return () => clearTimeout(t);
  }, [gain, holdMs]);
  return gain;
}
