import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

/**
 * Переключатель темы для публичной части. Пишет в тот же ключ
 * localStorage('theme-preference'), что и кабинет (ThemeContext) и
 * anti-flash скрипт в public.html — поэтому тема консистентна между
 * лендингом и приложением.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme-preference", next ? "dark" : "light");
    } catch {
      /* localStorage недоступен */
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label="Переключить тему"
      className={`p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition ${className}`}
    >
      {dark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
}
