import { useMemo } from "react";
import { Coffee, Moon, Sun, Sunrise, Sunset } from "lucide-react";

/**
 * Приветствие на главной — «Доброе утро, Иван» + день недели и
 * человеческая дата. Помогает сотруднику понять что программа знает
 * его (личный контакт), а заодно ориентироваться какой сегодня день
 * (для воркеров на сменах с переменным графиком — не всегда очевидно).
 *
 * Время суток определяется по локальному часу:
 *   05–11 утро,   11–17 день,   17–22 вечер,   22–05 ночь.
 *
 * Иконка времени дня — Sun/Sunrise/Sunset/Moon с цветным градиентом.
 */

const WEEKDAYS = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const MONTHS = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

type Props = {
  name: string | null;
};

export function GreetingBanner({ name }: Props) {
  const { greeting, icon, gradient, dateLabel } = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    const isMorning = hour >= 5 && hour < 11;
    const isDay = hour >= 11 && hour < 17;
    const isEvening = hour >= 17 && hour < 22;

    let greeting: string;
    let icon: React.ReactNode;
    let gradient: string;
    if (isMorning) {
      greeting = "Доброе утро";
      icon = <Sunrise className="w-7 h-7" strokeWidth={2} />;
      gradient = "from-amber-300/30 via-orange-200/20 to-pink-200/20";
    } else if (isDay) {
      greeting = "Добрый день";
      icon = <Sun className="w-7 h-7" strokeWidth={2} />;
      gradient = "from-sky-300/25 via-blue-200/15 to-cyan-200/20";
    } else if (isEvening) {
      greeting = "Добрый вечер";
      icon = <Sunset className="w-7 h-7" strokeWidth={2} />;
      gradient = "from-orange-400/25 via-rose-300/20 to-violet-300/20";
    } else {
      greeting = "Доброй ночи";
      icon = <Moon className="w-7 h-7" strokeWidth={2} />;
      gradient = "from-indigo-500/30 via-violet-500/20 to-blue-700/30";
    }

    const dateLabel = `${WEEKDAYS[now.getDay()]}, ${now.getDate()} ${MONTHS[now.getMonth()]}`;
    return { greeting, icon, gradient, dateLabel };
  }, []);

  // Только первое имя — «Иван Петров» → «Иван». Чтобы заголовок не
  // выглядел формально как в анкете.
  const firstName = name?.trim().split(/\s+/)[0] ?? null;

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
