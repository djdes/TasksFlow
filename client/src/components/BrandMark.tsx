import { BRAND_CHECK_PATH, BRAND_CHECK_STROKE, BRAND_FRAME_PATH, BRAND_FRAME_STROKE } from "@shared/brand";

/**
 * Знак TasksFlow: галочка в рамке видоискателя — «сделано и снято на фото».
 * Общий для лендинга и кабинета. На своей indigo-плашке — для светлых
 * поверхностей; onColor — без плашки, цветом текста, для цветных шапок.
 * Геометрия — shared/brand.ts (из неё же собираются иконки приложений).
 */
export function BrandMark({ className = "w-7 h-7", onColor = false }: { className?: string; onColor?: boolean }) {
  const ink = onColor ? "currentColor" : "#fff";
  return (
    <svg viewBox={onColor ? "6 6 20 20" : "0 0 32 32"} className={className} aria-hidden="true">
      {!onColor && <rect width="32" height="32" rx="9" fill="hsl(var(--primary))" />}
      <path d={BRAND_FRAME_PATH} fill="none" stroke={ink} strokeOpacity={onColor ? 0.7 : 0.55} strokeWidth={BRAND_FRAME_STROKE} strokeLinecap="round" />
      <path d={BRAND_CHECK_PATH} fill="none" stroke={ink} strokeWidth={BRAND_CHECK_STROKE} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
