/**
 * Маленькие «фотографии с объекта» для макетов лендинга. Нарисованы
 * векторно, чтобы не тянуть картинки и одинаково выглядеть в обеих
 * темах (фото не меняет цвета от темы интерфейса).
 */
export type PhotoKind = "showcase" | "shelf" | "tags" | "delivery";

export function MiniPhoto({ kind, className = "" }: { kind: PhotoKind; className?: string }) {
  return (
    <svg viewBox="0 0 120 90" className={className} role="img" aria-label={LABELS[kind]} preserveAspectRatio="xMidYMid slice">
      {kind === "showcase" && (
        <>
          <rect width="120" height="90" fill="#cfd8f6" />
          <rect x="18" y="8" width="84" height="82" rx="4" fill="#eef2ff" stroke="#9aa6d8" strokeWidth="2" />
          {[30, 52, 74].map((y) => <rect key={y} x="20" y={y} width="80" height="2.5" fill="#9aa6d8" />)}
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <rect x={25 + i * 15} y="14" width="8" height="16" rx="3" fill={BOTTLES[i % 4]} />
              <rect x={25 + i * 15} y="37" width="8" height="15" rx="3" fill={BOTTLES[(i + 1) % 4]} />
              <rect x={25 + i * 15} y="59" width="8" height="15" rx="3" fill={BOTTLES[(i + 2) % 4]} />
            </g>
          ))}
          <path d="M18 8 L50 8 L30 90 L18 90 Z" fill="#ffffff" opacity="0.28" />
        </>
      )}
      {kind === "shelf" && (
        <>
          <rect width="120" height="90" fill="#efe4d4" />
          {[28, 58, 88].map((y) => <rect key={y} x="0" y={y} width="120" height="4" fill="#b78a5c" />)}
          {[8, 30, 52, 74, 96].map((x, i) => (
            <g key={x}>
              <rect x={x} y={8 + (i % 2) * 4} width="18" height={20 - (i % 2) * 4} rx="2" fill={BOXES[i % 4]} />
              <rect x={x + 2} y={38 + (i % 3) * 2} width="16" height={20 - (i % 3) * 2} rx="2" fill={BOXES[(i + 2) % 4]} />
            </g>
          ))}
        </>
      )}
      {kind === "tags" && (
        <>
          <rect width="120" height="90" fill="#dfe6ee" />
          <rect x="0" y="0" width="120" height="44" fill="#f4f6fa" />
          {[10, 40, 70, 100].map((x, i) => <rect key={x} x={x - 6} y="8" width="20" height="34" rx="3" fill={BOTTLES[i]} opacity="0.85" />)}
          <rect x="0" y="44" width="120" height="12" fill="#56627a" />
          {[6, 36, 66, 96].map((x) => (
            <g key={x}>
              <rect x={x} y="46" width="22" height="16" rx="2" fill="#ffd84d" />
              <rect x={x + 3} y="50" width="10" height="2.5" fill="#2b3245" />
              <rect x={x + 3} y="55" width="15" height="4" fill="#2b3245" />
            </g>
          ))}
        </>
      )}
      {kind === "delivery" && (
        <>
          <rect width="120" height="90" fill="#d7deea" />
          <rect x="0" y="66" width="120" height="24" fill="#b9c3d4" />
          {[[14, 40, 34, 28], [50, 46, 30, 22], [82, 34, 28, 34], [24, 16, 26, 24], [86, 12, 22, 22]].map(([x, y, w, h], i) => (
            <g key={i}>
              <rect x={x} y={y + 2} width={w} height={h} rx="2" fill="#d39b5f" />
              <rect x={x + w / 2 - 3} y={y + 2} width="6" height={h} fill="#e8c08f" />
            </g>
          ))}
        </>
      )}
    </svg>
  );
}

const LABELS: Record<PhotoKind, string> = {
  showcase: "Фото: витрина с напитками",
  shelf: "Фото: товар на полках",
  tags: "Фото: ценники",
  delivery: "Фото: принятая поставка",
};
const BOTTLES = ["#ef6b6b", "#f5b942", "#4cc38a", "#5b8def"];
const BOXES = ["#7aa2f7", "#f29e6d", "#8bd3a8", "#c3a4f2"];
