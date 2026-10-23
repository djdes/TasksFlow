/**
 * Знак TasksFlow: галочка в рамке видоискателя — «сделано и снято на фото».
 * Общий для лендинга и кабинета. На своей indigo-плашке — для светлых
 * поверхностей; onColor — без плашки, цветом текста, для цветных шапок.
 */
const FRAME = "M8 12V9.5A1.5 1.5 0 0 1 9.5 8H12M20 8h2.5A1.5 1.5 0 0 1 24 9.5V12M24 20v2.5a1.5 1.5 0 0 1-1.5 1.5H20M12 24H9.5A1.5 1.5 0 0 1 8 22.5V20";
const CHECK = "m11.5 16.5 3 3 6-7";

export function BrandMark({ className = "w-7 h-7", onColor = false }: { className?: string; onColor?: boolean }) {
  const ink = onColor ? "currentColor" : "#fff";
  return (
    <svg viewBox={onColor ? "6 6 20 20" : "0 0 32 32"} className={className} aria-hidden="true">
      {!onColor && <rect width="32" height="32" rx="9" fill="hsl(var(--primary))" />}
      <path d={FRAME} fill="none" stroke={ink} strokeOpacity={onColor ? 0.7 : 0.55} strokeWidth="2" strokeLinecap="round" />
      <path d={CHECK} fill="none" stroke={ink} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
