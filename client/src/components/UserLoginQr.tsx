import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Printer, QrCode, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { UserLoginLink } from "@shared/user-login-link";

type QrUser = { id: number; name?: string | null; phone?: string | null };

const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;"));

/**
 * Личный QR входа: сотрудник сканирует камерой телефона и сразу в своём
 * аккаунте, без телефона и PIN. Это ключ от аккаунта — отдают лично.
 * «Новый QR» и «Отключить» — когда QR потерян или попал не тому.
 */
export function UserLoginQrDialog({
  user,
  open,
  onOpenChange,
}: {
  user: QrUser;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const key = ["/api/users", user.id, "login-link"];
  const name = user.name?.trim() || user.phone || `Сотрудник #${user.id}`;
  const [dataUrl, setDataUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmRenew, setConfirmRenew] = useState(false);

  // Открыли окно — QR сразу: если его ещё нет, сервер делает новый.
  const link = useQuery<UserLoginLink>({
    queryKey: key,
    queryFn: async () => (await apiRequest("POST", `/api/users/${user.id}/login-link`, {})).json(),
    enabled: open,
    staleTime: 0,
    retry: false,
  });
  const renew = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", `/api/users/${user.id}/login-link`, { renew: true })).json() as Promise<UserLoginLink>,
    onSuccess: (data) => {
      queryClient.setQueryData(key, data);
      setConfirmRenew(false);
      toast({ title: "Новый QR готов", description: "Старый QR больше не пускает." });
    },
    onError: (err: Error) => toast({ title: "Не удалось", description: err.message, variant: "destructive" }),
  });
  const revoke = useMutation({
    mutationFn: async () =>
      (await apiRequest("DELETE", `/api/users/${user.id}/login-link`)).json() as Promise<UserLoginLink>,
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: key });
      toast({ title: "Вход по QR отключён", description: `${name} входит по телефону и PIN.` });
      onOpenChange(false);
    },
    onError: (err: Error) => toast({ title: "Не удалось", description: err.message, variant: "destructive" }),
  });

  const url = link.data?.url ?? null;
  useEffect(() => {
    setDataUrl("");
    setCopied(false);
    if (!url) return;
    let cancelled = false;
    void QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: "M" }).then((d) => {
      if (!cancelled) setDataUrl(d);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      toast({ title: "Не удалось скопировать", variant: "destructive" });
    }
  };

  const print = () => {
    if (!dataUrl) return;
    const w = window.open("", "_blank", "width=480,height=640");
    if (!w) return;
    const safe = escapeHtml(name);
    w.document.write(
      `<!doctype html><meta charset="utf-8"><title>Вход — ${safe}</title>` +
        `<body style="font-family:system-ui,sans-serif;text-align:center;padding:24px">` +
        `<h2 style="margin:0 0 4px">${safe}</h2>` +
        `<p style="margin:0 0 16px;color:#555">Наведите камеру телефона — и вы в TasksFlow</p>` +
        `<img src="${dataUrl}" style="width:320px;height:320px" alt="QR">` +
        `<script>window.onload=function(){window.print()}</script></body>`,
    );
    w.document.close();
  };

  const busy = renew.isPending || revoke.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" aria-hidden /> Вход по QR — {name}
          </DialogTitle>
          <DialogDescription>
            Сотрудник наводит камеру телефона на QR и сразу попадает в свой аккаунт, без номера и PIN.
          </DialogDescription>
        </DialogHeader>
        {link.isPending ? (
          <div className="mx-auto h-64 w-64 animate-pulse rounded-xl bg-muted" role="status" aria-label="Готовим QR" />
        ) : link.isError ? (
          <p role="alert" className="text-sm text-destructive">
            {(link.error as Error).message || "Не удалось сделать QR-код"}
          </p>
        ) : (
          <div className="space-y-4">
            <div className="mx-auto w-fit rounded-xl bg-white p-3" data-testid="user-login-qr">
              {dataUrl ? <img src={dataUrl} alt={`QR входа: ${name}`} className="h-60 w-60" /> : <div className="h-60 w-60" />}
            </div>
            <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
              Кто отсканирует этот QR, войдёт как {name}. Отдайте его лично, не пересылайте в общие чаты.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={copy} disabled={!url}>
                {copied ? <Check className="mr-1.5 h-4 w-4" aria-hidden /> : <Copy className="mr-1.5 h-4 w-4" aria-hidden />}
                {copied ? "Скопировано" : "Скопировать ссылку"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={print} disabled={!dataUrl}>
                <Printer className="mr-1.5 h-4 w-4" aria-hidden /> Печать
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
              {confirmRenew ? (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span>Старый QR перестанет пускать.</span>
                  <Button type="button" size="sm" onClick={() => renew.mutate()} disabled={busy}>
                    Сделать новый
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRenew(false)} disabled={busy}>
                    Отмена
                  </Button>
                </div>
              ) : (
                <>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setConfirmRenew(true)} disabled={busy}>
                    <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden /> Новый QR
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => revoke.mutate()}
                    disabled={busy}
                  >
                    Отключить вход по QR
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
