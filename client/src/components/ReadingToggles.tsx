import { useState } from "react";
import { CaseSensitive, Contrast } from "lucide-react";
import { getReadingPref, setReadingPref, type ReadingPref } from "@/lib/reading-prefs";

const ITEMS: { pref: ReadingPref; label: string; icon: typeof Contrast }[] = [
  { pref: "textLarge", label: "Крупный текст", icon: CaseSensitive },
  { pref: "contrastHigh", label: "Контраст", icon: Contrast },
];

/**
 * «Крупный текст» и «Контраст» — для тех, кто плохо видит. Те же строки-
 * переключатели, что «Анимации» (MotionToggle): в меню задач и в «Моём аккаунте».
 */
export function ReadingToggles() {
  const [values, setValues] = useState(() => ({
    textLarge: getReadingPref("textLarge"),
    contrastHigh: getReadingPref("contrastHigh"),
  }));
  return (
    <>
      {ITEMS.map(({ pref, label, icon: Icon }) => {
        const on = values[pref];
        return (
          <button
            key={pref}
            type="button"
            role="switch"
            aria-checked={on}
            className="dropdown-item w-full"
            data-testid={`reading-${pref}`}
            onClick={() => {
              setReadingPref(pref, !on);
              setValues((v) => ({ ...v, [pref]: !on }));
            }}
          >
            <Icon className="w-5 h-5 text-primary" aria-hidden />
            <span className="font-medium flex-1 text-left">{label}</span>
            <span className="motion-toggle" data-checked={on} aria-hidden="true"><span /></span>
          </button>
        );
      })}
    </>
  );
}
