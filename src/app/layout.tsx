import type { Metadata } from "next";
import { ServiceWorkerRegister } from "@/components/layout/sw-register";
import { YandexMetrika } from "@/components/layout/yandex-metrika";
import "./globals.css";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  metadataBase: new URL("https://wesetup.ru"),
  title: {
    default:
      "WeSetup — электронные журналы СанПиН и ХАССП. Бесплатно навсегда",
    template: "%s — WeSetup",
  },
  description:
    "34 электронных журнала СанПиН и ХАССП для общепита и пищевых производств. Автозаполнение, Telegram-бот, PDF для проверок Роспотребнадзора. Бесплатно навсегда до 5 сотрудников.",
  keywords: [
    "электронные журналы",
    "журналы СанПиН",
    "журналы ХАССП",
    "HACCP онлайн",
    "гигиенический журнал",
    "бракеражный журнал",
    "журнал температурного режима",
    "Роспотребнадзор",
    "общепит",
  ],
  applicationName: "WeSetup",
  authors: [{ name: "WeSetup" }],
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: "https://wesetup.ru",
    siteName: "WeSetup",
    title:
      "WeSetup — электронные журналы СанПиН и ХАССП. Бесплатно навсегда",
    description:
      "34 электронных журнала СанПиН и ХАССП. Автозаполнение, Telegram-бот, PDF для Роспотребнадзора.",
  },
  twitter: {
    card: "summary_large_image",
    title: "WeSetup — электронные журналы СанПиН и ХАССП",
    description:
      "Автозаполнение, Telegram-бот, PDF для проверок. Бесплатно навсегда.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0b1024" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="default"
        />
        <meta name="apple-mobile-web-app-title" content="WeSetup" />
      </head>
      <body className="antialiased overflow-x-hidden">
        {children}
        <ServiceWorkerRegister />
        <YandexMetrika />
      </body>
    </html>
  );
}
