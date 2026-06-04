import { useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { AuthModal } from "../landing/auth";
import { ThemeToggle } from "../landing/ThemeToggle";
import { TopBanner } from "./TopBanner";

/**
 * Шапка публичной части. На лендинге ссылки ведут к якорям секций,
 * на остальных страницах — на абсолютные пути. Кнопка «Войти» открывает
 * единую модалку входа (телефон ИЛИ email — стиль Госуслуг).
 */
export function Nav({ onLanding = false }: { onLanding?: boolean }) {
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // После гидрации проверяем сессию: залогиненный видит «Открыть кабинет»
  // вместо «Войти». SSR рендерит дефолт (не залогинен) — без mismatch,
  // т.к. смена происходит в эффекте после маунта.
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (alive && u && u.id) setLoggedIn(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const links = [
    { href: onLanding ? "#features" : "/#features", label: "Возможности" },
    { href: onLanding ? "#how" : "/#how", label: "Как работает" },
    { href: "/blog", label: "Блог" },
    { href: onLanding ? "#pricing" : "/#pricing", label: "Тарифы" },
  ];

  return (
    <>
    <TopBanner />
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <a href="/" className="text-xl font-extrabold tracking-tight text-foreground">
          Tasks<span className="text-primary">Flow</span>
        </a>

        <nav className="hidden md:flex items-center gap-7">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="nav-underline text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          {loggedIn ? (
            <a
              href="/dashboard"
              className="shine press rounded-full bg-primary text-primary-foreground text-sm font-semibold px-5 py-2 shadow-lg shadow-primary/25 hover:brightness-105 transition"
            >
              Открыть кабинет
            </a>
          ) : (
            <button
              onClick={() => setAuthOpen(true)}
              className="shine press rounded-full bg-primary text-primary-foreground text-sm font-semibold px-5 py-2 shadow-lg shadow-primary/25 hover:brightness-105 transition"
            >
              Войти
            </button>
          )}
          <button className="md:hidden p-2 text-foreground" onClick={() => setMenuOpen((o) => !o)} aria-label="Меню">
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-border bg-background px-4 py-3 space-y-1">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="block py-2 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMenuOpen(false)}>
              {l.label}
            </a>
          ))}
          <button
            onClick={() => { setMenuOpen(false); setAuthOpen(true); }}
            className="block w-full text-left py-2 text-sm font-semibold text-primary"
          >
            Войти или зарегистрироваться
          </button>
        </div>
      )}

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </header>
    </>
  );
}
