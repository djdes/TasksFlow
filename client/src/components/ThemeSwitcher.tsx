/**
 * ThemeSwitcher — pill-переключатель темы. Три состояния:
 *   • Авто (системная — следит за prefers-color-scheme)
 *   • Светлая
 *   • Тёмная
 *
 * Используется в Dashboard-меню и в CompanySettings. UI-инвариант:
 * текущая выбранная вариация подсвечена primary-фоном; на hover
 * остальные мягко поднимаются.
 */
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "@/contexts/ThemeContext";

const OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  Icon: typeof Sun;
}> = [
  { value: "system", label: "Авто", Icon: Monitor },
  { value: "light", label: "Светлая", Icon: Sun },
  { value: "dark", label: "Тёмная", Icon: Moon },
];

export function ThemeSwitcher({ compact = false }: { compact?: boolean }) {
  const { preference, setPreference } = useTheme();

  return (
    <div
      className={`theme-switcher ${compact ? "theme-switcher--compact" : ""}`}
      role="radiogroup"
      aria-label="Тема оформления"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = preference === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setPreference(value)}
            className={`theme-switcher-btn ${active ? "is-active" : ""}`}
          >
            <Icon className="w-4 h-4" />
            {!compact && <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}
