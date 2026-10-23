import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import { demoRole, resetDemo, setDemoRole } from "./demo-api";
import { exitDemo } from "./demo-mode";

/**
 * Полоса демо-кабинета: что это, переключатель «как руководитель / как
 * сотрудник» и выход к регистрации. Данные живут только в этой вкладке.
 */
export function DemoBar() {
  const queryClient = useQueryClient();
  const [role, setRole] = useState(demoRole());

  const switchRole = (next: "admin" | "worker") => {
    if (next === role) return;
    setDemoRole(next);
    setRole(next);
    void queryClient.resetQueries();
  };

  return (
    <div className="demo-bar" role="region" aria-label="Демо-кабинет">
      <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span className="demo-bar-text">
        <span className="demo-bar-long">Демо: всё понарошку, данные не сохраняются</span>
        <span className="demo-bar-short">Демо</span>
      </span>
      <div className="demo-bar-roles" role="radiogroup" aria-label="Смотреть как">
        <button type="button" role="radio" aria-checked={role === "admin"} onClick={() => switchRole("admin")}>
          Руководитель
        </button>
        <button type="button" role="radio" aria-checked={role === "worker"} onClick={() => switchRole("worker")}>
          Сотрудник
        </button>
      </div>
      <a className="demo-bar-cta" href="/register/company" onClick={() => exitDemo()}>
        <span className="demo-bar-long">Создать свой кабинет</span>
        <span className="demo-bar-short">Свой кабинет</span>
        <span className="demo-bar-tiny">Начать</span>
      </a>
      <button
        type="button"
        className="demo-bar-close"
        aria-label="Выйти из демо"
        onClick={() => {
          exitDemo();
          resetDemo();
          window.location.href = "/";
        }}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
