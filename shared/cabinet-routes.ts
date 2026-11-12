/**
 * Адреса кабинета (SPA) — те же `path`, что в `<Switch>` из client/src/App.tsx.
 *
 * Сервер отдаёт оболочку кабинета на любой адрес, которого не знает сам. По этому
 * списку он решает, с каким кодом: известный адрес кабинета — 200, остальное — 404.
 * Раньше любой мусорный адрес (/wp-login.php, /llms.txt, опечатка в ссылке) получал
 * 200 и страницу входа: поисковики видят это как «мягкие 404» и дубли страницы входа.
 *
 * Тело ответа в обоих случаях одно — оболочка кабинета: человек увидит экран
 * «Страница не найдена» из приложения, а пропущенный здесь адрес продолжит работать.
 * Список сверяется с App.tsx тестом tests/cabinet-routes.test.ts.
 */
export const CABINET_ROUTES: readonly string[] = [
  "/",
  "/login",
  "/login/qr/:token",
  "/account",
  "/reports",
  "/register",
  "/register/company",
  "/register/user",
  "/instructions",
  "/help",
  "/dashboard",
  "/admin/users",
  "/admin/settings",
  "/admin/api-keys",
  "/admin/integrations",
  "/admin/verification",
  "/admin/invitations",
  "/admin/quick-login",
  "/admin/banners",
  "/admin/companies",
  "/admin/billing",
  "/billing/success",
  "/billing/fail",
  "/join/:token",
  "/quick-login/:token",
  "/tasks/new",
  "/tasks/:id/edit",
  "/workers/new",
  "/workers/:id/edit",
  // Вход в демо-кабинет: адрес разбирает client/src/main.tsx, в App.tsx его нет.
  "/demo",
];

const MATCHERS: RegExp[] = CABINET_ROUTES.map((route) => {
  const body = route
    .split("/")
    .map((part) => (part.startsWith(":") ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
    .join("/");
  return new RegExp(`^${body}$`);
});

/** Есть ли у кабинета страница по этому пути (без строки запроса). */
export function isCabinetRoute(pathname: string): boolean {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : pathname;
  return MATCHERS.some((re) => re.test(clean));
}
