import { useMemo } from "react";
import { Coffee, Moon, Sun, Sunrise, Sunset } from "lucide-react";
import {
  formatDateLabel,
  firstNameOf,
  getTimeOfDay,
  greetingByTime,
  type TimeOfDay,
} from "@/lib/greeting";

/**
 * Приветствие на главной — «Доброе утро, Иван» + день недели и
 * человеческая дата. Помогает сотруднику понять что программа знает
 * его (личный контакт), а заодно ориентироваться какой сегодня день
 * (для воркеров на сменах с переменным графиком — не всегда очевидно).
 *
 * Логика выбора времени суток + форматирование даты — в lib/greeting.ts
 * (тестируется отдельно). Здесь только React-presentation.
 */

const ICONS: Record<TimeOfDay, React.ReactNode> = {
  morning: <Sunrise className="w-7 h-7" strokeWidth={2} />,
  day: <Sun className="w-7 h-7" strokeWidth={2} />,
  evening: <Sunset className="w-7 h-7" strokeWidth={2} />,
  night: <Moon className="w-7 h-7" strokeWidth={2} />,
};

const GRADIENTS: Record<TimeOfDay, string> = {
  morning: "from-amber-300/30 via-orange-200/20 to-pink-200/20",
  day: "from-sky-300/25 via-blue-200/15 to-cyan-200/20",
  evening: "from-orange-400/25 via-rose-300/20 to-violet-300/20",
  night: "from-indigo-500/30 via-violet-500/20 to-blue-700/30",
};

type Props = {
  name: string | null;
};

export function GreetingBanner({ name }: Props) {
  const { greeting, icon, gradient, dateLabel } = useMemo(() => {
    const now = new Date();
    const time = getTimeOfDay(now.getHours());
    return {
      greeting: greetingByTime(time),
      icon: ICONS[time],
      gradient: GRADIENTS[time],
      dateLabel: formatDateLabel(now),
    };
  }, []);

  const firstName = firstNameOf(name);

  return (
    <div
      className={`greeting-banner bg-gradient-to-br ${gradient}`}
      role="banner"
      aria-label="Приветствие"
    >
      <div className="greeting-icon">
        {icon}
      </div>
      <div className="greeting-text">
        <div className="greeting-title">
          {greeting}{firstName ? `, ${firstName}` : ""}
        </div>
        <div className="greeting-date">
          <span className="greeting-coffee" aria-hidden="true">
            <Coffee className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
          </span>
          {dateLabel}
        </div>
      </div>
    </div>
  );
}
