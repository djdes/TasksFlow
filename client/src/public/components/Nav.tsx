import { lazy, Suspense, useState, useEffect } from "react";
import { Menu, X } from "lucide-react";
import { ThemeToggle } from "../landing/ThemeToggle";
import { TopBanner } from "./TopBanner";
import { Logo } from "./Logo";

// Окно входа грузится по требованию: SSR его не рендерит, а модуль
// подтягивается при наведении/фокусе на «Войти» или при первом клике.
const AuthModal = lazy(() => import("../landing/auth-modal"));
const preloadAuthModal = () => {
  void import("../landing/auth-modal");
};

/**
 * Шапка публичной части. На лендинге ссылки ведут к якорям секций,
 * на остальных страницах — на абсолютные пути. Кнопка «Войти» открывает
 * единую модалку входа (телефон ИЛИ email — стиль Госуслуг).
 */
export function Nav({ onLanding = false }: { onLanding?: boolean }) {
  const [authOpen, setAuthOpen] = useState(false);
  // Однажды открытое окно остаётся смонтированным, чтобы закрытие
  // доиграло анимацию, а не обрывалось размонтированием.
  const [authMounted, setAuthMounted] = useState(false);
  const openAuth = () => {
    setAuthMounted(true);
    setAuthOpen(true);
  };
  const [menuOpen, setMenuOpen] = useState(false);
  // После гидрации проверяем сессию: залогиненный видит «Открыть кабинет»
  // вместо «Войти». SSR рендерит дефолт (не залогинен) — без mismatch,
  // т.к. смена происходит в эффекте после маунта.
  const [loggedIn, setLoggedIn] = useState(false);
  // После первого скролла шапка сжимается в плавающую «пилюлю».
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
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
    <header className={`site-nav ${scrolled || menuOpen ? "is-scrolled" : ""}`}>
      <span className="scroll-progress" aria-hidden="true" />
      <div className="site-nav-inner">
        <a href="/" aria-label="TasksFlow — на главную">
          <Logo />
        </a>

        <nav className="hidden md:flex items-center gap-7" aria-label="Разделы">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="nav-underline text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          {loggedIn ? (
            <a href="/dashboard" className="nav-cta press">
              Открыть кабинет
            </a>
          ) : (
            <button onClick={openAuth} onPointerEnter={preloadAuthModal} onFocus={preloadAuthModal} className="nav-cta press">
              Войти
            </button>
          )}
          <button className="md:hidden p-2 rounded-lg text-foreground hover:bg-muted" onClick={() => setMenuOpen((o) => !o)} aria-label="Меню" aria-expanded={menuOpen}>
            {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="site-nav-menu md:hidden">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="block py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground" onClick={() => setMenuOpen(false)}>
              {l.label}
            </a>
          ))}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => { setMenuOpen(false); openAuth(); }}
              onPointerEnter={preloadAuthModal}
              className="py-2.5 text-sm font-semibold text-primary"
            >
              Войти или зарегистрироваться
            </button>
            <ThemeToggle className="sm:hidden" />
          </div>
        </div>
      )}

      {authMounted && (
        <Suspense fallback={null}>
          <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
        </Suspense>
      )}
    </header>
    </>
  );
}
