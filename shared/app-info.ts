/** Идентификатор приложений: applicationId на Android и bundle id на iOS. */
export const APP_PACKAGE_ID = "ru.tasksflow.app";

/** GET /api/app/info — откуда ставить приложения (server/app-links.ts). */
export type AppInfo = {
  android: {
    /** APK с сайта; null — CI ещё не опубликовал сборку. */
    apk: { url: string; versionName: string; size: number; builtAt: string | null } | null;
    playUrl: string | null;
    rustoreUrl: string | null;
  };
  ios: {
    appStoreUrl: string | null;
    testflightUrl: string | null;
  };
};
