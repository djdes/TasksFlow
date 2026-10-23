/**
 * Знак TasksFlow: галочка в рамке видоискателя — «сделано и снято на фото».
 * Цвета от токенов темы, работает и в светлой, и в тёмной теме.
 */
export function LogoMark({ className = "w-7 h-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="hsl(var(--primary))" />
      <path d="M8 12V9.5A1.5 1.5 0 0 1 9.5 8H12M20 8h2.5A1.5 1.5 0 0 1 24 9.5V12M24 20v2.5a1.5 1.5 0 0 1-1.5 1.5H20M12 24H9.5A1.5 1.5 0 0 1 8 22.5V20" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2" strokeLinecap="round" />
      <path d="m11.5 16.5 3 3 6-7" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 text-xl font-extrabold tracking-tight text-foreground ${className}`}>
      <LogoMark />
      <span>Tasks<span className="text-primary">Flow</span></span>
    </span>
  );
}
