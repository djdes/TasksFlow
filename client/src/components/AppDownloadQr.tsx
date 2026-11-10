import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Прямая ссылка на APK: его выкладывает CI Android (docs/mobile.md). */
export const APK_PATH = "/downloads/tasksflow.apk";

/**
 * «QR приложения»: руководитель показывает экран сотруднику, тот наводит
 * камеру Android-телефона и сразу скачивает APK TasksFlow.
 */
export function AppDownloadQrButton() {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState("");
  const url = typeof window === "undefined" ? APK_PATH : `${window.location.origin}${APK_PATH}`;

  useEffect(() => {
    if (!open || dataUrl) return;
    void QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M" }).then(setDataUrl);
  }, [open, dataUrl, url]);

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)} data-testid="app-qr-open">
        <Smartphone className="mr-1.5 h-4 w-4" aria-hidden /> QR приложения
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Приложение TasksFlow для Android</DialogTitle>
            <DialogDescription>
              Покажите QR сотруднику: он наводит камеру телефона, скачивает файл и устанавливает приложение.
            </DialogDescription>
          </DialogHeader>
          <div className="mx-auto w-fit rounded-xl bg-white p-3" data-testid="app-qr">
            {dataUrl ? <img src={dataUrl} alt="QR для скачивания приложения" className="h-64 w-64" /> : <div className="h-64 w-64" />}
          </div>
          <p className="text-xs text-muted-foreground">
            Если телефон спросит — разрешите установку из браузера. На iPhone APK не ставится: там откройте tasksflow.ru и
            добавьте на экран «Домой».
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
