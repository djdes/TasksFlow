import { useState } from "react";
import { Volume2 } from "lucide-react";
import { isFeedbackEnabled, setFeedbackEnabled } from "@/lib/feedback";

/**
 * Звук и вибрация при «Готово» (lib/feedback.ts) — только отклик на касание,
 * не уведомления: разрешения браузера не спрашивает. Уведомления — отдельный
 * переключатель PushMenuToggle рядом. По умолчанию включены —
 * сотрудник сразу чувствует, что отметка прошла; выключить можно на ночной
 * смене или в open-space. Состояние читается при монтировании: меню и
 * «Мой аккаунт» открываются заново и видят свежее значение.
 */
export function FeedbackToggle() {
  const [on, setOn] = useState(isFeedbackEnabled);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Звук и вибрация при «Готово»"
      className="dropdown-item w-full"
      onClick={(e) => {
        e.stopPropagation();
        setFeedbackEnabled(!on);
        setOn(!on);
      }}
    >
      <Volume2 className="w-5 h-5 text-primary" />
      <span className="font-medium flex-1 text-left">Звук при «Готово»</span>
      <span className="motion-toggle" data-checked={on} aria-hidden="true"><span /></span>
    </button>
  );
}
