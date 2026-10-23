import type { ReactNode } from "react";
import { Bell, Camera, CloudOff, Download, ExternalLink, Share, Smartphone, SquarePlus, Zap } from "lucide-react";
import { Nav } from "../components/Nav";
import { Footer } from "../components/Footer";
import { BrandMark } from "../../components/BrandMark";
import { promptInstall, useInstallState } from "../../lib/pwa";
import type { AppPageData } from "../types";

const FEATURES = [
  { icon: Bell, title: "Уведомления", text: "Новые задачи, возвраты на доработку и напоминания утром и вечером." },
  { icon: Camera, title: "Фотоотчёт с камеры", text: "Снимок сразу в задачу, со временем и сжатием — уходит за секунды." },
  { icon: CloudOff, title: "Плохая связь — не беда", text: "Фото без сети встают в очередь и отправляются сами." },
  { icon: Zap, title: "В одно касание", text: "Иконка на экране, без адресной строки, вход по PIN сохраняется." },
];

function mb(bytes: number) {
  return `${(bytes / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}

function StoreButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener" className="app-store-btn">
      {children}
      <ExternalLink className="w-4 h-4 opacity-70" aria-hidden="true" />
    </a>
  );
}

/**
 * «Приложение TasksFlow»: как поставить на Android и iPhone. Магазины и APK
 * показываются, только когда они правда есть (/api/app/info), установка из
 * браузера — всегда. С компьютера — QR-код, чтобы открыть страницу на телефоне.
 */
export function AppPage({ data }: { data: AppPageData | null }) {
  const install = useInstallState();
  const info = data?.info;
  const apk = info?.android.apk ?? null;

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      <Nav />
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 pt-8 pb-20 sm:pt-12">
        <header className="app-page-hero">
          <BrandMark className="w-14 h-14" />
          <div>
            <h1 className="app-page-title">TasksFlow на телефоне</h1>
            <p className="app-page-lead">
              Приложение для Android и iPhone: задачи смены, чек-листы и фотоотчёты — с уведомлениями и без адресной строки.
            </p>
          </div>
        </header>

        <div className="app-page-grid">
          <section className="app-platform" aria-labelledby="app-android">
            <h2 id="app-android" className="app-platform-title">
              <Smartphone className="w-5 h-5 text-primary" aria-hidden="true" /> Android
            </h2>
            <div className="app-platform-actions">
              {install.canPrompt && install.platform === "android" && (
                <button type="button" className="app-primary-btn" onClick={() => void promptInstall()}>
                  Установить
                </button>
              )}
              {apk && (
                <a href={apk.url} className={install.canPrompt ? "app-store-btn" : "app-primary-btn"} download>
                  <Download className="w-4 h-4" aria-hidden="true" />
                  Скачать APK · {mb(apk.size)}
                </a>
              )}
              {info?.android.playUrl && <StoreButton href={info.android.playUrl}>Google Play</StoreButton>}
              {info?.android.rustoreUrl && <StoreButton href={info.android.rustoreUrl}>RuStore</StoreButton>}
            </div>
            <ol className="app-steps">
              <li>
                Откройте <b>tasksflow.ru</b> в Chrome.
              </li>
              <li>
                Меню <b>⋮</b> → <b>«Установить приложение»</b> (или «Добавить на главный экран»).
              </li>
              <li>Запустите TasksFlow с экрана и включите уведомления в «Аккаунте».</li>
            </ol>
            {apk && (
              <p className="app-note">
                APK {apk.versionName}: если телефон спросит, разрешите установку из браузера. Обновления сайта приходят сами, APK
                переустанавливать не нужно.
              </p>
            )}
          </section>

          <section className="app-platform" aria-labelledby="app-ios">
            <h2 id="app-ios" className="app-platform-title">
              <Smartphone className="w-5 h-5 text-primary" aria-hidden="true" /> iPhone и iPad
            </h2>
            {(info?.ios.appStoreUrl || info?.ios.testflightUrl) && (
              <div className="app-platform-actions">
                {info.ios.appStoreUrl && <StoreButton href={info.ios.appStoreUrl}>App Store</StoreButton>}
                {!info.ios.appStoreUrl && info.ios.testflightUrl && <StoreButton href={info.ios.testflightUrl}>TestFlight</StoreButton>}
              </div>
            )}
            <ol className="app-steps">
              <li>
                Откройте <b>tasksflow.ru</b> в Safari.
              </li>
              <li>
                Нажмите <Share className="inline w-4 h-4 -mt-1" aria-label="«Поделиться»" /> внизу экрана.
              </li>
              <li>
                Выберите <SquarePlus className="inline w-4 h-4 -mt-1" aria-hidden="true" /> <b>«На экран „Домой“»</b> →{" "}
                <b>«Добавить»</b>.
              </li>
              <li>Откройте TasksFlow с экрана и включите уведомления в «Аккаунте» (iOS 16.4 и новее).</li>
            </ol>
          </section>

          {data?.qrSvg && (
            <section className="app-platform app-qr" aria-labelledby="app-qr">
              <h2 id="app-qr" className="app-platform-title">С компьютера</h2>
              <div className="app-qr-row">
                <div className="app-qr-code" role="img" aria-label={`QR-код: ${data.url}`} dangerouslySetInnerHTML={{ __html: data.qrSvg }} />
                <p className="app-note">Наведите камеру телефона на код — откроется эта страница, и останется пара касаний.</p>
              </div>
            </section>
          )}
        </div>

        <ul className="app-features">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Icon className="w-5 h-5 text-primary" aria-hidden="true" />
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ul>
      </main>
      <Footer />
    </div>
  );
}
